set -eu
sudo -u postgres psql -d barbacue -At <<'SQL'
SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
SELECT table_name||'.'||column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('orders','staff_users','store_settings') ORDER BY table_name, ordinal_position;
SELECT tgname FROM pg_trigger WHERE tgname='orders_print_on_insert';
SELECT count(*) FROM kitchen_print_jobs;
SQL
cat /etc/nginx/sites-available/barbacue.cog.ia.br.conf
ls -la /root/barbacue
node -e 'console.log(require("/root/barbacue/node_modules/next/package.json").version)'
