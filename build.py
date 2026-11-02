"""Собирает все игры: главная (index.html, комната), tochki/, ttt/, battleship/, checkers/, go/ из папки src. Запуск: python3 build.py"""
import os, re, json, shutil, datetime, zoneinfo
here = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(here, 'src')
ver = datetime.datetime.now(zoneinfo.ZoneInfo('Europe/Vienna')).strftime('%d.%m.%Y %H:%M')
read = lambda *p: open(os.path.join(src, *p), encoding='utf-8').read()
net, room, review = read('shared', 'net.js'), read('shared', 'room-client.js'), read('shared', 'review.js')
def head(extra='', root=''):
    # root: путь до корня сайта ('' для главной, '../' для игр) — манифест, иконки и работа без интернета
    app = ('<link rel="manifest" href="{r}manifest.webmanifest"><meta name="theme-color" content="#121726">'
           '<link rel="icon" href="{r}icon-192.png"><link rel="apple-touch-icon" href="{r}apple-touch-icon.png">'
           '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">'
           '<meta name="apple-mobile-web-app-status-bar-style" content="black"><meta name="apple-mobile-web-app-title" content="Игры">'
           '<script>if("serviceWorker" in navigator&&window.isSecureContext)addEventListener("load",function(){{navigator.serviceWorker.register("{r}sw.js").catch(function(){{}})}});</script>').format(r=root)
    return ('<!doctype html>\n<html lang="ru"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' + app +
            '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
            'body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style>'
            '<script>window.GAMES_ONLINE=true;window.TTT_ONLINE=true;window.BGC_ONLINE=true;</script>' + extra + '</head><body>\n')
def build(name):
    page = read(name, 'ui.html').replace('/*CORE*/', read(name, 'core.js')).replace('/*NET*/', net).replace('/*REVIEW*/', review).replace('/*VER*/', ver)
    d = os.path.join(here, name); os.makedirs(d, exist_ok=True)
    open(os.path.join(d, 'index.html'), 'w', encoding='utf-8').write(head('<script>' + room + '</script>', '../') + page + '\n</body></html>\n')
    print('собрано:', name + '/index.html')
GAMES = ['tochki', 'ttt', 'battleship', 'checkers', 'go']
for g in GAMES: build(g)
hub = read('hub.html').replace('/*NET*/', net).replace('/*VER*/', ver)
open(os.path.join(here, 'index.html'), 'w', encoding='utf-8').write(head() + hub + '\n</body></html>\n')
print('собрано: index.html (главная и комната)')
# работа без интернета: манифест, иконки и service worker в корень сайта
fonts = set()
for f in ['index.html'] + [g + '/index.html' for g in GAMES]:
    fonts.update(re.findall(r'href="(https://fonts\.googleapis\.com/css2\?[^"]+)"', open(os.path.join(here, f), encoding='utf-8').read()))
for n in ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']:
    shutil.copy(os.path.join(src, 'app', n), os.path.join(here, n))
sw = read('app', 'sw.js').replace('/*VER*/', ver).replace('/*FONTS*/[]', json.dumps(sorted(fonts)))
open(os.path.join(here, 'sw.js'), 'w', encoding='utf-8').write(sw)
print('собрано: sw.js, manifest.webmanifest, иконки (шрифтов: %d)' % len(fonts))
