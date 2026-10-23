# Quin encaixa millor?

Joc de cotxes per a fans del motor. Surt un repte amb criteris (carrosseria, anys, potència, tracció...), tens **30 segons** per triar el cotxe que hi encaixa millor i un jutge el compara amb el del Rival IA, criteri per criteri i amb fonts.

## Com funciona

- `index.html` és la pàgina sencera, en un sol fitxer, amb les fitxes dels cotxes incrustades. Només es pot triar un cotxe que sigui a la base de dades.
- La partida la porta Make. La pàgina envia cada ordre a un webhook d'entrada i, només mentre espera una resposta (preparar el repte o el veredicte), demana els missatges nous a un webhook de recollida. Durant els 30 segons de triar no fa cap petició, perquè el cronòmetre es calcula amb l'hora límit que dona el servidor.
- `motor/engine_web.js` és el motor de partida que corre a Make (escenari «QEM web — Motor de partida»). Les proves: `node motor/web_test.js`.
- Límit diari: Make compta els passos que gasten IA (començar partida, ronda següent, enviar cotxe, tornar a comprovar). En passar de 80 en un dia, no els fa i la pàgina avisa que es torni a provar l'endemà. El límit es canvia al filtre de l'escenari «QEM web — Entrada (envia)».
- Amb `?demo` al final de l'adreça, la pàgina juga en mode local: rival i jutge simplificats al navegador, sense Make.

## Canviar la pàgina

Edita `pagina/pagina.html` (disseny i lògica) o `pagina/cotxes.json` (fitxes) i torna a generar `index.html`:

```
python3 eines/construeix.py
```

## La clau de la pàgina

El paràmetre `k` que la pàgina envia a Make no és cap secret: només serveix perquè els webhooks ignorin trànsit a l'atzar. Qualsevol que miri el codi de la pàgina el pot veure.
