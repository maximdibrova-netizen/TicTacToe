"""Собирает index.html (версия для сайта, с онлайном) из src/ui.html и src/core.js. Запуск: python3 build.py"""
import os, datetime, zoneinfo
here = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(here, 'src') if os.path.isdir(os.path.join(here, 'src')) else here
ui = open(os.path.join(src, 'ui.html'), encoding='utf-8').read()
core = open(os.path.join(src, 'core.js'), encoding='utf-8').read()
page = ui.replace('/*CORE*/', core).replace('/*VER*/', datetime.datetime.now(zoneinfo.ZoneInfo('Europe/Vienna')).strftime('%d.%m.%Y %H:%M'))
head = ('<!doctype html>\n<html lang="ru"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
        'body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style>'
        '<script>window.TTT_ONLINE=true;</script></head><body>\n')
open(os.path.join(here, 'index.html'), 'w', encoding='utf-8').write(head + page + '\n</body></html>\n')
print('index.html собран')
