DO $$
DECLARE
  cid uuid := '00c5d644-349a-4320-8321-3c7aca3db6ac';
  r record;
  dup uuid;
BEGIN
  FOR r IN
    WITH members AS (
      SELECT i.id,
             coalesce(nullif(lower(trim(i.handle)),''), nullif(lower(trim(i.email)),'')) AS k,
             i.created_at,
             (SELECT count(*) FROM posts p WHERE p.influencer_id = i.id) AS post_count
      FROM campaign_influencers ci
      JOIN influencers i ON i.id = ci.influencer_id
      WHERE ci.campaign_id = cid
    ),
    ranked AS (
      SELECT k,
             (array_agg(id ORDER BY post_count DESC, created_at ASC))[1] AS keeper,
             array_agg(id) AS ids
      FROM members WHERE k IS NOT NULL GROUP BY k HAVING count(*) > 1
    )
    SELECT keeper, ids FROM ranked
  LOOP
    FOREACH dup IN ARRAY r.ids LOOP
      IF dup = r.keeper THEN CONTINUE; END IF;
      UPDATE posts SET influencer_id = r.keeper WHERE influencer_id = dup;
      BEGIN
        UPDATE contest_entries SET influencer_id = r.keeper WHERE influencer_id = dup;
      EXCEPTION WHEN undefined_column OR undefined_table THEN NULL;
      END;
      DELETE FROM campaign_influencers WHERE influencer_id = dup;
      BEGIN
        DELETE FROM influencers WHERE id = dup;
      EXCEPTION WHEN foreign_key_violation THEN NULL;
      END;
    END LOOP;
  END LOOP;
END $$;