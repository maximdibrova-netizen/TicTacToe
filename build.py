"""Собирает все игры: главная (index.html, комната), tochki/, ttt/, battleship/, checkers/ из папки src. Запуск: python3 build.py"""
import os, datetime, zoneinfo
here = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(here, 'src')
ver = datetime.datetime.now(zoneinfo.ZoneInfo('Europe/Vienna')).strftime('%d.%m.%Y %H:%M')
read = lambda *p: open(os.path.join(src, *p), encoding='utf-8').read()
net, room = read('shared', 'net.js'), read('shared', 'room-client.js')
def head(extra=''):
    return ('<!doctype html>\n<html lang="ru"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
            '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
            'body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style>'
            '<script>window.GAMES_ONLINE=true;window.TTT_ONLINE=true;window.BGC_ONLINE=true;</script>' + extra + '</head><body>\n')
def build(name):
    page = read(name, 'ui.html').replace('/*CORE*/', read(name, 'core.js')).replace('/*NET*/', net).replace('/*VER*/', ver)
    d = os.path.join(here, name); os.makedirs(d, exist_ok=True)
    open(os.path.join(d, 'index.html'), 'w', encoding='utf-8').write(head('<script>' + room + '</script>') + page + '\n</body></html>\n')
    print('собрано:', name + '/index.html')
for g in ['tochki', 'ttt', 'battleship', 'checkers']: build(g)
hub = read('hub.html').replace('/*NET*/', net).replace('/*VER*/', ver)
open(os.path.join(here, 'index.html'), 'w', encoding='utf-8').write(head() + hub + '\n</body></html>\n')
print('собрано: index.html (главная и комната)')
