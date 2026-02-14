-- Remove duplicate cluster_ids from raw_cases, keeping one row per cluster_id.
-- Keeps the row with plain_text if any; otherwise the most recently created.
-- Run this if you have duplicate cluster_ids.
--
-- To inspect duplicates first:
--   SELECT cluster_id, source, COUNT(*) FROM raw_cases GROUP BY cluster_id, source HAVING COUNT(*) > 1;
--   SELECT cluster_id, COUNT(*) FROM raw_cases GROUP BY cluster_id HAVING COUNT(*) > 1;

delete from raw_cases
where id in (
  select id
  from (
    select id,
           row_number() over (
             partition by cluster_id
             order by (plain_text is not null and length(plain_text) > 0) desc,
                      created_at desc
           ) as rn
    from raw_cases
  ) sub
  where rn > 1
);

-- Optional: enforce one row per cluster_id going forward (if source is always courtlistener)
-- Uncomment if you want to prevent future duplicates by cluster_id:
-- alter table raw_cases drop constraint if exists raw_cases_cluster_id_source_key;
-- create unique index if not exists raw_cases_cluster_id_key on raw_cases(cluster_id);
