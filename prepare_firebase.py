"""Build a whitelist of public files for Firebase; never publish the repository root."""
from pathlib import Path
import runpy
import shutil

ROOT = Path(__file__).resolve().parent

def prepare():
    built = runpy.run_path(str(ROOT / 'build.py'))
    target = ROOT / 'firebase-public'
    # Resolve and check the fixed destination before replacing any directory.
    if target.is_symlink() or target.resolve().parent != ROOT or target.name != 'firebase-public':
        raise RuntimeError('Unexpected Firebase output directory')
    if target.exists():
        shutil.rmtree(target)
    target.mkdir()
    for name in ['index.html', 'account.js', 'sw.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']:
        shutil.copy2(ROOT / name, target / name)
    for game in built['GAMES']:
        shutil.copytree(ROOT / game, target / game)
    print('Firebase готов:', len(built['GAMES']), 'игр; только публичные файлы')

if __name__ == '__main__':
    prepare()
