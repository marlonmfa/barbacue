set -eu
umask 077
backup=/root/deploy-backups/barbacue-20260910T142106Z
mkdir -p "$backup"
sudo -u postgres pg_dump -Fc barbacue > "$backup/database.dump"
tar -czf "$backup/application.tar.gz" -C /root barbacue
pm2 jlist > "$backup/pm2-private.json"
cat /root/barbacue/apps/web/.next/BUILD_ID > "$backup/previous-build-id.txt"
mkdir -p /root/barbacue-next-20260910T142106Z
printf 'Backup concluído: %s\n' "$backup"
du -sh "$backup"
