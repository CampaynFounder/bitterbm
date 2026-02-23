"""
Codegen to Config Converter API
Converts Playwright codegen output to structured scraper configuration
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Optional
import re

router = APIRouter()


class CodegenInput(BaseModel):
    """Raw Playwright codegen code"""
    code: str
    county_id: str


class ScraperConfig(BaseModel):
    """Structured scraper configuration"""
    county_id: str
    navigation_steps: List[Dict]
    search_form: Dict
    results_table: Dict
    extraction_rules: Dict


class CodegenConverter:
    """
    Converts Playwright codegen output to structured config
    
    Identifies:
    - Navigation steps (goto, click, fill)
    - Form inputs (search criteria)
    - Table structures (results, nested tables)
    - PDF links
    - Pagination
    """
    
    def __init__(self, code: str):
        self.code = code
        self.lines = code.strip().split('\n')
        self.steps = []
        self.current_iframe = None
    
    def convert(self) -> Dict:
        """Main conversion method"""
        
        self._parse_code()
        
        return {
            'navigation_steps': self._extract_navigation_steps(),
            'search_form': self._extract_search_form(),
            'results_table': self._extract_results_table(),
            'extraction_rules': self._extract_extraction_rules()
        }
    
    def _parse_code(self):
        """Parse codegen code into structured steps"""
        
        for line in self.lines:
            line = line.strip()
            
            # Skip imports and function definitions
            if line.startswith('import') or line.startswith('def') or line.startswith('from'):
                continue
            
            # Extract page actions
            if 'page.' in line or 'locator' in line:
                step = self._parse_line(line)
                if step:
                    self.steps.append(step)
    
    def _parse_line(self, line: str) -> Optional[Dict]:
        """Parse a single line of code"""
        
        # Track iframe context
        if '.content_frame' in line:
            self.current_iframe = self._extract_iframe_selector(line)
        
        # Navigation
        if '.goto(' in line:
            url = re.search(r'\.goto\(["\'](.+?)["\'', line)
            if url:
                return {
                    'type': 'navigate',
                    'url': url.group(1)
                }
        
        # Fill input
        elif '.fill(' in line:
            selector = self._extract_selector(line)
            value_match = re.search(r'\.fill\(["\'](.+?)["\']\)', line)
            
            if selector and value_match:
                return {
                    'type': 'fill',
                    'selector': selector,
                    'value': value_match.group(1),
                    'iframe': self.current_iframe
                }
        
        # Click
        elif '.click()' in line:
            selector = self._extract_selector(line)
            # Skip noisy "click iframe" / "check iframe" steps (selector same as iframe)
            if selector and selector != (self.current_iframe or ''):
                return {
                    'type': 'click',
                    'selector': selector,
                    'iframe': self.current_iframe
                }
        
        # Check checkbox
        elif '.check()' in line:
            selector = self._extract_selector(line)
            if selector and selector != (self.current_iframe or ''):
                return {
                    'type': 'check',
                    'selector': selector,
                    'iframe': self.current_iframe
                }
        
        # Wait
        elif 'wait_for_timeout' in line:
            timeout = re.search(r'wait_for_timeout\((\d+)\)', line)
            if timeout:
                return {
                    'type': 'wait',
                    'duration': int(timeout.group(1))
                }
        
        # Extract text (for identifying fields to capture)
        elif '.inner_text()' in line or '.text_content()' in line:
            selector = self._extract_selector(line)
            if selector:
                return {
                    'type': 'extract',
                    'selector': selector,
                    'iframe': self.current_iframe
                }
        
        return None
    
    def _extract_selector(self, line: str) -> Optional[str]:
        """Extract CSS/XPath selector from line. When line has .content_frame (iframe), use the innermost selector after it."""
        locator_matches = re.findall(r'\.locator\(["\'](.+?)["\']\)', line)
        role_matches = list(re.finditer(r'\.get_by_role\(["\'](.+?)["\'](?:, name=["\'](.+?)["\'])?\)', line))
        text_matches = re.findall(r'\.get_by_text\(["\'](.+?)["\']\)', line)
        # If the only .locator() is the iframe and there is get_by_role/get_by_text, use the inner selector so we keep e.g. "Civil Search" link click
        last_loc = locator_matches[-1] if locator_matches else None
        is_iframe_only = last_loc and (last_loc.strip() == "iframe" or last_loc.strip().startswith("iframe"))
        if locator_matches and is_iframe_only and (role_matches or text_matches):
            if role_matches:
                m = role_matches[-1]
                role = m.group(1)
                name = m.group(2) if m.group(2) else ''
                return f'[role="{role}"][name*="{name}"]'
            if text_matches:
                return f':text("{text_matches[-1]}")'
        if locator_matches:
            return locator_matches[-1]
        if role_matches:
            m = role_matches[-1]
            role = m.group(1)
            name = m.group(2) if m.group(2) else ''
            return f'[role="{role}"][name*="{name}"]'
        if text_matches:
            return f':text("{text_matches[-1]}")'
        return None
    
    def _extract_iframe_selector(self, line: str) -> Optional[str]:
        """Extract iframe selector (the first .locator("iframe...") in the chain)."""
        match = re.search(r'\.locator\(["\'](iframe[^"\']*)["\']\)', line)
        if match:
            return match.group(1)
        return 'iframe'
    
    def _extract_navigation_steps(self) -> List[Dict]:
        """Get all navigation and interaction steps"""
        
        # Exclude steps that look like result extraction
        nav_steps = []
        for step in self.steps:
            if step['type'] in ['navigate', 'fill', 'click', 'check', 'wait']:
                nav_steps.append(step)
            
            # Stop at first result table interaction
            if step['type'] == 'click' and 'tr:nth-child' in step.get('selector', ''):
                break
        
        return nav_steps
    
    def _extract_search_form(self) -> Dict:
        """Extract search form field mappings"""
        
        form_fields = {}
        
        for step in self.steps:
            if step['type'] == 'fill':
                selector = step['selector']
                value = step['value']
                
                # Identify field purpose by selector ID or value pattern
                if 'search' in selector.lower() or 'party' in selector.lower() or 'name' in selector.lower():
                    form_fields['party_name'] = selector
                elif 'from' in selector.lower() or 'start' in selector.lower():
                    form_fields['date_from'] = selector
                elif 'to' in selector.lower() or 'end' in selector.lower():
                    form_fields['date_to'] = selector
        
        # Find search button
        for step in self.steps:
            if step['type'] == 'click':
                selector = step.get('selector', '')
                if 'search' in selector.lower() or 'submit' in selector.lower():
                    form_fields['search_button'] = selector
                    break
        
        return form_fields
    
    def _detect_nested_table_checks(self) -> List[Dict]:
        """If expand/icon clicks suggest a nested table, return one nestedTableChecks entry for the JSON."""
        for step in self.steps:
            sel = step.get('selector', '')
            if step['type'] != 'click':
                continue
            if 'img' in sel or 'icon' in sel.lower():
                if 'add.png' in sel or 'expand' in sel.lower() or 'EventGrid' in sel:
                    return [{
                        'name': 'Events',
                        'tableSelector': 'table#EventGrid',
                        'scope': 'row',
                        'rowSelector': 'tbody tr',
                        'operator': 'exists',
                        'outputInRow': True,
                    }]
            # Cobb-style: img with numeric id often toggles nested table
            if sel.startswith('#img') or (re.search(r'img\d+', sel) and 'tr:nth-child' not in sel):
                return [{
                    'name': 'Events',
                    'tableSelector': 'table#EventGrid',
                    'scope': 'row',
                    'rowSelector': 'tbody tr',
                    'operator': 'exists',
                    'outputInRow': True,
                }]
        return []

    def _extract_results_table(self) -> Dict:
        """Identify results table structure with full schema (primaryId, nestedRowFilters, nestedTableChecks)."""
        iframe = None
        for step in self.steps:
            if step['type'] == 'click' and 'tr:nth-child' in step.get('selector', ''):
                iframe = step.get('iframe')
                break

        base = {
            'table_selector': 'table',
            'row_selector': 'tbody tr',
            'tableSelector': 'table',
            'rowSelector': 'tbody tr',
            'primaryId': {'source': 'column', 'columnIndex': 1},
            'threshold': 5,
            'nestedRowFilters': [],
            'nestedTableChecks': self._detect_nested_table_checks(),
        }
        if iframe is not None:
            base['iframe'] = iframe
        return base
    
    def _extract_extraction_rules(self) -> Dict:
        """
        Define what data to extract from each case
        
        This is semi-automated - requires human review
        """
        
        rules = {}
        
        # Look for column clicks to identify fields
        column_clicks = []
        for step in self.steps:
            if step['type'] == 'click' and 'td:nth-child' in step.get('selector', ''):
                match = re.search(r'td:nth-child\((\d+)\)', step['selector'])
                if match:
                    column_clicks.append(int(match.group(1)))
        
        # Common column mappings (user should review)
        if 1 in column_clicks:
            rules['case_number'] = {'selector': 'td:nth-child(1)', 'type': 'text'}
        if 2 in column_clicks:
            rules['parties'] = {'selector': 'td:nth-child(2)', 'type': 'text'}
        if 5 in column_clicks:
            rules['case_type_code'] = {'selector': 'td:nth-child(5)', 'type': 'text'}
        if 6 in column_clicks:
            rules['case_type_desc'] = {'selector': 'td:nth-child(6)', 'type': 'text'}
        if 8 in column_clicks:
            rules['judge'] = {'selector': 'td:nth-child(8)', 'type': 'text'}
        
        # Look for expand/collapse icon clicks (nested tables)
        for step in self.steps:
            selector = step.get('selector', '')
            if step['type'] == 'click' and ('img' in selector or 'icon' in selector):
                if 'add.png' in selector or 'expand' in selector:
                    rules['has_nested_table'] = True
                    rules['expand_icon'] = {'selector': selector}
                    break
        
        # Look for PDF links
        for step in self.steps:
            if step['type'] == 'click' and 'a' in step.get('selector', ''):
                rules['pdf_links'] = {
                    'selector': 'a[href*=".pdf"], a[href*="document"]',
                    'type': 'href'
                }
                break
        
        return rules


@router.post("/convert-codegen")
async def convert_codegen(input: CodegenInput):
    """
    Convert Playwright codegen output to structured config
    
    Example:
    ```
    POST /api/pipeline/convert-codegen
    {
      "code": "...",
      "county_id": "abc-123"
    }
    ```
    
    Returns structured config ready for human review
    """
    
    try:
        converter = CodegenConverter(input.code)
        config = converter.convert()
        
        # Save to database as draft
        # (requires Supabase client setup)
        
        return {
            'success': True,
            'config': config,
            'message': 'Config generated. Please review and validate before use.',
            'needs_review': [
                'extraction_rules',
                'search_form field mappings',
                'results_table structure'
            ]
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/validate-config/{config_id}")
async def validate_config(config_id: str):
    """
    Mark config as validated and ready for use
    
    Should be called after human review
    """
    
    # Update database
    # supabase.table('scraper_configs').update({
    #     'is_validated': True,
    #     'validated_at': datetime.now()
    # }).eq('id', config_id).execute()
    
    return {'success': True, 'message': 'Config validated'}


# Example usage
if __name__ == "__main__":
    # Test with Cobb County code
    code = """
    page.goto("https://superiorcourtclerk.cobbcounty.gov/WebCaseManagement/mainpage.aspx")
    page.locator("iframe").content_frame.locator("#tbSearch4").fill("jo%n%")
    page.locator("iframe").content_frame.locator("#tbFiledFrom").fill("01/01/2020")
    page.locator("iframe").content_frame.locator("#tbFiledTo").fill("12/31/2024")
    page.locator("iframe").content_frame.get_by_role("button", name="Search").click()
    page.locator("iframe").content_frame.locator("tr:nth-child(17) > td:nth-child(1)").click()
    """
    
    converter = CodegenConverter(code)
    config = converter.convert()
    
    print(json.dumps(config, indent=2))
