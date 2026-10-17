-- The News tab became the haze map; its headlines feed is no longer fetched.
DELETE FROM feeds WHERE name = 'news';
