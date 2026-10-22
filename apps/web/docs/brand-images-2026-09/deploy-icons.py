from pathlib import Path
import shutil, subprocess
backup=Path('/root/backups/brand-images-20260920')
backup.mkdir(parents=True,exist_ok=True)
conf_paths=[Path('/etc/nginx/sites-enabled/barbacue.hirableaiagents.com.conf'),Path('/etc/nginx/sites-enabled/barbacue.cog.ia.br.conf')]
map_path=Path('/etc/nginx/sites-enabled/00-barbacue-brand-icons-map.conf')
snippet=Path('/etc/nginx/snippets/barbacue-brand-icons.conf')
if map_path.exists() or snippet.exists(): raise SystemExit('Icon configuration already exists; inspect before reapplying')
for p in conf_paths:
 if not (backup/p.name).exists(): shutil.copy2(p,backup/p.name)
map_path.write_text('map $host $barbacue_icon_brand {\n default barbacue;\n chelas.hirableaiagents.com chelas;\n barbadog.hirableaiagents.com barbadog;\n}\n')
snippet.write_text('''
location /menu/brands-2026-09/ { alias /var/www/barbacue-brand-menu/; add_header Cache-Control "public, max-age=3600"; }
location = /favicon.ico { alias /var/www/barbacue-brand-icons/$barbacue_icon_brand-icon.png; default_type image/png; add_header Cache-Control "no-cache"; }
location = /icon.png { alias /var/www/barbacue-brand-icons/$barbacue_icon_brand-icon.png; default_type image/png; add_header Cache-Control "no-cache"; }
location = /apple-icon.png { alias /var/www/barbacue-brand-icons/$barbacue_icon_brand-apple.png; default_type image/png; add_header Cache-Control "no-cache"; }
location /brand/icons/ { alias /var/www/barbacue-brand-icons/; add_header Cache-Control "public, max-age=3600"; }
location = /brand/brand-images-20260920.css { alias /var/www/barbacue-brand-icons/presentation.css; default_type text/css; }
sub_filter_once off;
sub_filter_types text/x-component;
sub_filter '/favicon.ico' '/brand/icons/$barbacue_icon_brand-icon.png?v=20260920';
sub_filter '/icon.png?' '/brand/icons/$barbacue_icon_brand-icon.png?v=20260920&legacy=';
sub_filter '/apple-icon.png?' '/brand/icons/$barbacue_icon_brand-apple.png?v=20260920&legacy=';
sub_filter '</head>' '<link rel="stylesheet" href="/brand/brand-images-20260920.css"></head>';
''')
try:
 for p in conf_paths:
  text=p.read_text()
  text=text.replace('server {','server {\n    include /etc/nginx/snippets/barbacue-brand-icons.conf;')
  text=text.replace('proxy_pass http://127.0.0.1:3007;', 'proxy_pass http://127.0.0.1:3007;\n        proxy_set_header Accept-Encoding "";')
  p.write_text(text)
 subprocess.run(['nginx','-t'],check=True)
 subprocess.run(['systemctl','reload','nginx'],check=True)
except:
 for p in conf_paths: shutil.copy2(backup/p.name,p)
 map_path.unlink(missing_ok=True); snippet.unlink(missing_ok=True)
 raise
print('Brand icons and presentation stylesheet activated')
