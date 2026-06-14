-- Legacy keep-at-farm sales stored status=available with sold_to set. Mark them sold.
UPDATE koi_fish
SET status = 'sold',
    updated_at = now()
WHERE sold_to IS NOT NULL
  AND status NOT IN ('sold', 'deceased');
