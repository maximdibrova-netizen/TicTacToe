"""Собирает все игры: hub (index.html), ttt/, battleship/, checkers/ из папки src. Запуск: python3 build.py"""
import os, datetime, zoneinfo
here = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(here, 'src')
ver = datetime.datetime.now(zoneinfo.ZoneInfo('Europe/Vienna')).strftime('%d.%m.%Y %H:%M')
net = open(os.path.join(src, 'shared', 'net.js'), encoding='utf-8').read()
HEAD = ('<!doctype html>\n<html lang="ru"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
        'body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style>'
        '<script>window.GAMES_ONLINE=true;window.TTT_ONLINE=true;</script></head><body>\n')
def build(name, out_dir):
    ui = open(os.path.join(src, name, 'ui.html'), encoding='utf-8').read()
    core = open(os.path.join(src, name, 'core.js'), encoding='utf-8').read()
    page = ui.replace('/*CORE*/', core).replace('/*NET*/', net).replace('/*VER*/', ver)
    d = os.path.join(here, out_dir) if out_dir else here
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, 'index.html'), 'w', encoding='utf-8').write(HEAD + page + '\n</body></html>\n')
    print('собрано:', (out_dir or '.') + '/index.html')
build('ttt', 'ttt')
build('battleship', 'battleship')
build('checkers', 'checkers') if os.path.exists(os.path.join(src, 'checkers', 'ui.html')) else None
hub = open(os.path.join(src, 'hub.html'), encoding='utf-8').read().replace('/*VER*/', ver) if os.path.exists(os.path.join(src, 'hub.html')) else None
if hub:
    open(os.path.join(here, 'index.html'), 'w', encoding='utf-8').write(HEAD + hub + '\n</body></html>\n'); print('собрано: index.html (меню игр)')
