# Genera index.html: la pàgina amb les fitxes de cotxes incrustades (un sol fitxer per a GitHub Pages).
from pathlib import Path

arrel = Path(__file__).resolve().parent.parent
pagina = (arrel / 'pagina' / 'pagina.html').read_text(encoding='utf8')
cotxes = (arrel / 'pagina' / 'cotxes.json').read_text(encoding='utf8').strip()
assert pagina.count('/*COTXES*/[]') == 1
cos = pagina.replace('/*COTXES*/[]', cotxes)
html = ('<!doctype html>\n<html lang="ca">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<meta name="description" content="Joc de cotxes: tria el que encaixa millor amb el repte en 30 segons.">\n'
        '<meta name="theme-color" content="#0D0D0F">\n'
        '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Crect width=%2232%22 height=%2232%22 rx=%226%22 fill=%22%230D0D0F%22/%3E%3Cpath d=%22M6 22 12 10h4l-6 12zm7 0 6-12h4l-6 12z%22 fill=%22%23E10600%22/%3E%3C/svg%3E">\n')
# El <title>, les fonts i l'estil de la pàgina van al <head>; la resta, al <body>.
cap, resta = cos.split('</style>', 1)
html += cap + '</style>\n</head>\n<body>' + resta + '\n</body>\n</html>\n'
(arrel / 'index.html').write_text(html, encoding='utf8')
print('index.html', len(html.encode('utf8')), 'bytes')
