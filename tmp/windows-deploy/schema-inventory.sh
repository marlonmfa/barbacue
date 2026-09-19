set -eu
sudo -u postgres psql -d barbacue -At <<'SQL'
SELECT json_agg(x) FROM (SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position) x;
SQL
