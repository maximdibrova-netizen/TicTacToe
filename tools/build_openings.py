"""База дебютов для шахмат из архива The Week in Chess (TWIC), https://theweekinchess.com/twic

Берёт номера выпусков FROM..TO, оставляет классические партии игроков 2300+ (без блица, рапида, онлайна),
считает статистику ходов для первых PLIES полуходов и сохраняет:
  src/chess/db/pos-XX.json  — позиции (шард по первым двум hex-символам ключа): { ключ: [[ход, всего, 1-0, ½, 0-1], ...], ... }
                              у части позиций ещё "ключ~g": [номера лучших партий]
  src/chess/db/games-NN.json — эти партии: { id: [белые, рейтинг, чёрные, рейтинг, год, турнир, результат, "ходы SAN"] }
  src/chess/db/names.json   — названия дебютов (lichess-org/chess-openings, CC0): { ключ: ["ECO", "название"] }
  src/chess/db/meta.json    — сколько партий, какие годы, какие выпуски
Ключ позиции: crc32(fen) и crc32(fen+fen) в hex, fen = расстановка + чья очередь + рокировки (без взятия на проходе).
Запуск: python3 tools/build_openings.py 1370 1669 [путь к chess-openings]
"""
import sys, os, io, re, json, zlib, zipfile, urllib.request, collections, time
import chess

FROM, TO = int(sys.argv[1]), int(sys.argv[2])
NAMES_DIR = sys.argv[3] if len(sys.argv) > 3 else None
PLIES, MIN_ELO, MIN_GAMES, TOP_GAMES, MAX_MOVES = 24, 2300, 3, 4, 14
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'chess', 'db')
SKIP_EVENT = re.compile(r'blitz|rapid|bullet|armageddon|titled|online|chess\.com|lichess|960|fischer|blind|simul|speed|tiebreak|tie-break|playoff|cct|meltwater|freestyle|basque|'
                        r'clutch|showdown|champions chess|global chess|pro chess|esports|e-sports|lightning|banter|airthings|aimchess|julius baer|goldmoney|'
                        r'chessable|opera euro|new in chess classic|carlsen invitational|charity cup|crypto|ftx|levitov|arena|bundesliga online|hybrid|virtual|internet|\bicc\b|kings tournament|fast|quick|knockout cup', re.I)

def key(fen):
    b = fen.encode()
    return '%08x%08x' % (zlib.crc32(b) & 0xffffffff, zlib.crc32(b + b) & 0xffffffff)
def pos_fen(board):
    return board.board_fen() + ' ' + ('w' if board.turn else 'b') + ' ' + (board.castling_xfen() or '-')

stats = {}            # key -> {san: [n, w, d, b]}
tops = {}             # key -> [(score, gid)]
plyof = {}            # key -> ply (для чистки)
games = {}            # gid -> header list + moves
gid_seq = 0
seen = set()
kept = skipped = 0
years = []

def tokens(movetext):
    t = re.sub(r'\{[^}]*\}', ' ', movetext)
    while '(' in t: t2 = re.sub(r'\([^()]*\)', ' ', t); t = t2 if t2 != t else t.replace('(', ' ')
    t = re.sub(r'\$\d+', ' ', t)
    out = []
    for w in t.split():
        if re.match(r'^\d+\.+$', w) or w in ('1-0', '0-1', '1/2-1/2', '*'): continue
        w = re.sub(r'^\d+\.+', '', w)
        if w: out.append(w)
    return out

def handle(h, movetext):
    global gid_seq, kept, skipped
    try: we, be = int(h.get('WhiteElo', '0') or 0), int(h.get('BlackElo', '0') or 0)
    except ValueError: skipped += 1; return
    res = h.get('Result', '*')
    if we < MIN_ELO or be < MIN_ELO or res not in ('1-0', '0-1', '1/2-1/2') or SKIP_EVENT.search(h.get('Event', '') + ' ' + h.get('Site', '')):
        skipped += 1; return
    sans = tokens(movetext)
    if len(sans) < 10: skipped += 1; return
    sig = (h.get('White'), h.get('Black'), h.get('Date'), ' '.join(sans[:30]))
    if sig in seen: skipped += 1; return
    seen.add(sig)
    board = chess.Board(); played = []
    for k, s in enumerate(sans):
        try: mv = board.parse_san(s)
        except Exception: break
        played.append(board.san(mv)); board.push(mv)
    if len(played) < 10: skipped += 1; return
    kept += 1; gid_seq += 1; gid = gid_seq
    y = (h.get('Date', '????')[:4]); years.append(y)
    games[gid] = [h.get('White', '?'), we, h.get('Black', '?'), be, y, h.get('Event', ''), res, ' '.join(played)]
    score = (we + be) / 2
    r = 0 if res == '1-0' else 1 if res == '1/2-1/2' else 2
    board = chess.Board()
    for ply in range(min(PLIES, len(played))):
        k = key(pos_fen(board)); san = played[ply]
        st = stats.setdefault(k, {}); m = st.setdefault(san, [0, 0, 0, 0]); m[0] += 1; m[1 + r] += 1
        plyof[k] = ply
        tp = tops.setdefault(k, [])
        if len(tp) < TOP_GAMES or score > tp[-1][0]:
            tp.append((score, gid)); tp.sort(key=lambda x: -x[0]); del tp[TOP_GAMES:]
        board.push_san(san)

def prune():
    # редкие длинные ветки: позиции, встреченные один раз после 10-го полухода
    drop = [k for k, st in stats.items() if plyof.get(k, 0) > 10 and sum(v[0] for v in st.values()) < 2]
    for k in drop: stats.pop(k, None); tops.pop(k, None); plyof.pop(k, None)

def parse_pgn(text):
    h, mt, inmoves = {}, [], False
    for line in text.splitlines():
        if line.startswith('['):
            if inmoves: handle(h, ' '.join(mt)); h, mt, inmoves = {}, [], False
            m = re.match(r'\[(\w+)\s+"(.*)"\]', line)
            if m: h[m.group(1)] = m.group(2)
        elif line.strip():
            inmoves = True; mt.append(line)
    if h: handle(h, ' '.join(mt))

t0 = time.time()
cache = os.environ.get('TWIC_CACHE', '/tmp/twic-cache')
os.makedirs(cache, exist_ok=True)
issues = []
for n in range(FROM, TO + 1):
    url = 'https://theweekinchess.com/zips/twic%dg.zip' % n
    try:
        cf = os.path.join(cache, '%d.zip' % n)
        if os.path.exists(cf): data = open(cf, 'rb').read()
        else:
            data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'games-site opening book (python)'}), timeout=60).read()
            open(cf, 'wb').write(data)
        z = zipfile.ZipFile(io.BytesIO(data))
        for nm in z.namelist():
            if nm.lower().endswith('.pgn'): parse_pgn(z.read(nm).decode('latin-1'))
        issues.append(n)
    except Exception as e:
        print('issue', n, 'failed:', e, flush=True)
    if n % 20 == 0:
        prune(); print('issue', n, 'kept', kept, 'skipped', skipped, 'positions', len(stats), '%.0fs' % (time.time() - t0), flush=True)
prune()

# итог: позиции с MIN_GAMES+ партиями
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT): os.remove(os.path.join(OUT, f))
shards = collections.defaultdict(dict); used = set()
for k, st in stats.items():
    n = sum(v[0] for v in st.values())
    if n < MIN_GAMES: continue
    mv = sorted(([s] + v for s, v in st.items()), key=lambda x: -x[1])[:MAX_MOVES]
    shards[k[:2]][k] = mv
    if n >= 8:
        g = [gid for _, gid in tops.get(k, [])]; shards[k[:2]][k + '~g'] = g; used.update(g)
for sh, d in shards.items():
    json.dump(d, open(os.path.join(OUT, 'pos-%s.json' % sh), 'w'), separators=(',', ':'), ensure_ascii=False)
gshards = collections.defaultdict(dict)
for gid in used: gshards[gid % 64][gid] = games[gid]
for sh, d in gshards.items():
    json.dump(d, open(os.path.join(OUT, 'games-%02d.json' % sh), 'w'), separators=(',', ':'), ensure_ascii=False)
# названия дебютов
names = {}
if NAMES_DIR:
    for f in sorted(os.listdir(NAMES_DIR)):
        if not f.endswith('.tsv'): continue
        for line in open(os.path.join(NAMES_DIR, f), encoding='utf-8').read().splitlines()[1:]:
            eco, name, pgn = line.split('\t')
            b = chess.Board()
            try:
                for s in tokens(pgn): b.push_san(s)
            except Exception: continue
            names[key(pos_fen(b))] = [eco, name]
json.dump(names, open(os.path.join(OUT, 'names.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
ys = sorted(y for y in years if y.isdigit())
meta = {'games': kept, 'from': ys[0] if ys else '', 'to': ys[-1] if ys else '', 'issues': [issues[0], issues[-1]] if issues else [], 'minElo': MIN_ELO,
        'positions': sum(len(d) for d in shards.values()), 'source': 'The Week in Chess (theweekinchess.com)'}
json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'), ensure_ascii=False)
print('done', meta, 'top games', len(used), '%.0fs' % (time.time() - t0))
