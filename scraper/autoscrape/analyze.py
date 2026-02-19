#!/usr/bin/env python3
"""
analyze.py — Master CLI

Three modes:

  RECORD mode (interactive browser session):
    python analyze.py record <url> [--output session.json]

  COMPILE mode (session → schema):
    python analyze.py compile session.json [--output schema.json] [--context "extra notes"]

  VALIDATE mode (schema → validated schema with live selector checks):
    python analyze.py validate schema.json [--output validated_schema.json]

  RUN mode (execute a schema locally):
    python analyze.py run schema.json [--params params.json] [--headed]

  PIPELINE mode (record + compile + validate in one shot):
    python analyze.py pipeline <url> [--output schema.json]
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path


def cmd_record(args):
    from analyzer.session_recorder import SessionRecorder

    recorder = SessionRecorder(
        url=args.url,
        output_path=args.output or "session.json"
    )
    asyncio.run(recorder.start())


def cmd_compile(args):
    from compiler.schema_compiler import SchemaCompiler

    compiler = SchemaCompiler(args.session)
    schema   = compiler.compile(extra_context=args.context or "")
    out      = args.output or "schema.json"

    with open(out, "w") as f:
        json.dump(schema, f, indent=2)

    print(f"\n✅ Schema written to: {out}")
    print(f"📋 Confidence: {schema.get('confidence', '?')}")
    for w in schema.get("warnings", []):
        print(f"⚠️  {w}")


def cmd_validate(args):
    from compiler.schema_validator import validate_schema_file

    asyncio.run(
        validate_schema_file(
            schema_path=args.schema,
            output_path=args.output,
        )
    )


def cmd_run(args):
    from runtime.executor import WorkflowExecutor

    with open(args.schema) as f:
        schema = json.load(f)

    params = {}
    if args.params:
        with open(args.params) as f:
            params = json.load(f)

    executor = WorkflowExecutor(schema, params)
    asyncio.run(executor.run(headless=not args.headed))


def cmd_pipeline(args):
    """Record → Compile → Validate in one flow."""
    import tempfile, os

    session_file = args.output.replace(".json", "_session.json") if args.output else "session.json"
    schema_file  = args.output or "schema.json"
    validated    = schema_file.replace(".json", "_validated.json")

    print("═" * 60)
    print(" PHASE 1: Record your interaction session")
    print("═" * 60)
    from analyzer.session_recorder import SessionRecorder
    recorder = SessionRecorder(url=args.url, output_path=session_file)
    asyncio.run(recorder.start())

    print("\n" + "═" * 60)
    print(" PHASE 2: Compile session → schema")
    print("═" * 60)
    from compiler.schema_compiler import SchemaCompiler
    compiler = SchemaCompiler(session_file)

    context = ""
    if args.context:
        context = args.context
    else:
        print("\nAny extra context for the schema compiler? (press ENTER to skip)")
        context = input("> ").strip()

    schema = compiler.compile(extra_context=context)
    with open(schema_file, "w") as f:
        json.dump(schema, f, indent=2)
    print(f"✅ Schema: {schema_file}")

    print("\n" + "═" * 60)
    print(" PHASE 3: Validate selectors against live page")
    print("═" * 60)
    from compiler.schema_validator import validate_schema_file
    asyncio.run(validate_schema_file(schema_file, validated))

    print(f"\n🎉 Pipeline complete!")
    print(f"   Session  : {session_file}")
    print(f"   Schema   : {schema_file}")
    print(f"   Validated: {validated}")
    print(f"\nTo run:  python analyze.py run {validated}")


def main():
    parser = argparse.ArgumentParser(description="DOM Analyzer — Web Automation Schema Generator")
    sub    = parser.add_subparsers(dest="command")

    # record
    rec = sub.add_parser("record", help="Launch browser and record interactions")
    rec.add_argument("url")
    rec.add_argument("--output", default="session.json")

    # compile
    comp = sub.add_parser("compile", help="Compile session.json → schema.json")
    comp.add_argument("session")
    comp.add_argument("--output", default="schema.json")
    comp.add_argument("--context", default="", help="Extra context for the LLM")

    # validate
    val = sub.add_parser("validate", help="Validate schema selectors against live page")
    val.add_argument("schema")
    val.add_argument("--output", default=None)

    # run
    run = sub.add_parser("run", help="Execute a schema locally")
    run.add_argument("schema")
    run.add_argument("--params", default=None)
    run.add_argument("--headed", action="store_true")

    # pipeline
    pipe = sub.add_parser("pipeline", help="Full pipeline: record → compile → validate")
    pipe.add_argument("url")
    pipe.add_argument("--output", default="schema.json")
    pipe.add_argument("--context", default="")

    args = parser.parse_args()

    match args.command:
        case "record":   cmd_record(args)
        case "compile":  cmd_compile(args)
        case "validate": cmd_validate(args)
        case "run":      cmd_run(args)
        case "pipeline": cmd_pipeline(args)
        case _:
            parser.print_help()
            sys.exit(1)


if __name__ == "__main__":
    main()
