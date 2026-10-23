# Genera el motor de sales amb les fitxes incrustades:
#   motor/sales_complet.js  (per a les proves amb Node)
#   motor/sales_make.js     (el que es puja a Make: acaba amb «return run(input);»)
from pathlib import Path

arrel = Path(__file__).resolve().parent.parent
font = (arrel / 'motor' / 'sales.js').read_text(encoding='utf8')
cotxes = (arrel / 'pagina' / 'cotxes.json').read_text(encoding='utf8').strip()
assert font.count('/*COTXES*/[]') == 1
complet = font.replace('/*COTXES*/[]', cotxes)
(arrel / 'motor' / 'sales_complet.js').write_text(complet, encoding='utf8')
cos, export = complet.rsplit("if (typeof module !== 'undefined')", 1)
make = cos.rstrip() + '\nreturn run(input);\n'
(arrel / 'motor' / 'sales_make.js').write_text(make, encoding='utf8')
print('sales_make.js', len(make), 'caràcters')
