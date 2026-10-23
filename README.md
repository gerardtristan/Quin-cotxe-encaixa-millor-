# Quin encaixa millor?

Joc de cotxes per a fans del motor. Surt un repte amb criteris (carrosseria, anys, potència, tracció...), tens **30 segons** per triar el cotxe que hi encaixa millor i el jutge compara les fitxes criteri per criteri. Es pot jugar sol contra el Rival IA o en una sala de fins a **8 persones** amb un enllaç.

## Com funciona

- `index.html` és la pàgina sencera, en un sol fitxer, amb les fitxes dels cotxes incrustades. Només es pot triar un cotxe que sigui a la base de dades.
- La partida la porta Make. La IA de Make inventa els reptes al començament de la partida, només amb criteris que hi ha a les fitxes, i el motor els descarta si no hi encaixen prou cotxes. El veredicte surt de comparar les fitxes, sense IA.
- Sales: qui crea la sala rep un enllaç `?sala=...` per enviar. Tothom té el mateix repte alhora; a cada ronda es guanya un punt per cada rival superat (mig punt si hi ha empat). L'amfitrió comença la partida i passa de ronda; si no hi és, la ronda següent arriba sola.
- Escenaris de Make: «QEM sales — Entrada» rep les ordres (les tries de cotxe es desen a part perquè vuit persones no facin cua), «QEM sales — Motor» aplica les ordres d'una en una amb el codi `motor/sales.js`, i «QEM sales — Estat de la sala» respon a la pàgina amb l'estat. La pàgina només pregunta quan espera un canvi i deixa de fer-ho en acabar la partida o si la pestanya no és visible.
- Límit diari: «QEM sales — Entrada» accepta 600 ordres al dia (entrar, començar, triar, passar de ronda...). En passar-ne, la pàgina avisa que es torni a provar l'endemà. El límit es canvia als filtres d'aquest escenari.
- Amb `?demo` al final de l'adreça, la pàgina juga en mode local: rival i jutge simplificats al navegador, sense Make.

## Motor de sales

`motor/sales.js` és el motor. `python3 eines/motor_sales.py` hi incrusta les fitxes i genera `motor/sales_make.js` (el codi que es carrega a Make) i `motor/sales_complet.js` (per a les proves). Proves: `node motor/sales_test.js` (motor) i `node eines/prova_pagina_sales.js .` (pàgina amb diversos jugadors i un Make simulat, amb Playwright). Per pujar una versió nova a Make, l'escenari «QEM eina — Carrega el motor de sales des de GitHub» la baixa del repositori i comprova la llargada i el hash abans de desar-la.

## Canviar la pàgina

Edita `pagina/pagina.html` (disseny i lògica) o `pagina/cotxes.json` (fitxes) i torna a generar `index.html`:

```
python3 eines/construeix.py
```

## La clau de la pàgina

El paràmetre `k` que la pàgina envia a Make no és cap secret: només serveix perquè els webhooks ignorin trànsit a l'atzar. Qualsevol que miri el codi de la pàgina el pot veure.
