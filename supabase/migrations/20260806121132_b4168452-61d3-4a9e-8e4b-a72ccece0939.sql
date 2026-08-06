DO $$
DECLARE
  cid uuid := '00c5d644-349a-4320-8321-3c7aca3db6ac';
  r record; dup uuid; alt text;
BEGIN
  FOR r IN
    WITH members AS (
      SELECT i.id, nullif(lower(trim(i.email)),'') AS k, i.created_at,
             (SELECT count(*) FROM posts p WHERE p.influencer_id = i.id) AS pc
      FROM campaign_influencers ci JOIN influencers i ON i.id = ci.influencer_id
      WHERE ci.campaign_id = cid
    )
    SELECT (array_agg(id ORDER BY pc DESC, created_at ASC))[1] AS keeper, array_agg(id) AS ids
    FROM members WHERE k IS NOT NULL GROUP BY k HAVING count(*) > 1
  LOOP
    FOREACH dup IN ARRAY r.ids LOOP
      IF dup = r.keeper THEN CONTINUE; END IF;
      SELECT nullif(trim(handle),'') INTO alt FROM influencers WHERE id = dup;
      IF alt IS NOT NULL THEN
        UPDATE influencers
        SET alt_handles = (SELECT array_agg(DISTINCT x) FROM unnest(coalesce(alt_handles, '{}'::text[]) || alt) AS x)
        WHERE id = r.keeper;
      END IF;
      UPDATE posts SET influencer_id = r.keeper WHERE influencer_id = dup;
      DELETE FROM campaign_influencers WHERE influencer_id = dup;
      BEGIN DELETE FROM influencers WHERE id = dup; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    END LOOP;
  END LOOP;
END $$;