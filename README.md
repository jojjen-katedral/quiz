# Nyårsquiz 🎆

Ett partyquiz där frågorna visas på TV:n och alla svarar med mobilen.
Ingen server och inget konto behövs: allt ligger på GitHub Pages. Mobilerna
pratar direkt med TV-sidan via [PeerJS](https://peerjs.com) (WebRTC).

## Kom igång (cirka 5 minuter)

1. Skapa ett nytt **publikt** repo på GitHub, till exempel `nyarsquiz`.
2. Ladda upp alla filer: *Add file → Upload files*, dra in allt och tryck *Commit*.
3. Gå till *Settings → Pages*. Under *Branch* väljer du `main` och `/ (root)` och trycker *Save*.
4. Efter någon minut ligger sidan på `https://<ditt-användarnamn>.github.io/nyarsquiz/`.

## På festen

- Öppna **`.../host.html`** i webbläsaren på datorn som är kopplad till TV:n och tryck ⛶ för helskärm.
- Gästerna skannar QR-koden, skriver sitt namn och väljer lag.
- **Mellanslag** (eller knappen) tar quizet till nästa steg: fråga → svar → ställning → nästa fråga.
- Svaren visas automatiskt när tiden är ute eller när alla har svarat.
- Vid fritextfrågor kan du klicka på ett svar på TV:n för att ändra det mellan rätt och fel.
- Om en mobil låser sig eller sidan laddas om ansluter den igen av sig själv och behåller sina poäng.
  Även TV-sidan kommer ihåg spelet om den laddas om.

## Göra egna frågor

Redigera `questions.js` direkt på GitHub (pennikonen). Instruktionerna står överst i filen.
Vill du ha bilder lägger du dem i repot, till exempel `bilder/fyrverkeri.jpg`, och skriver
`image: 'bilder/fyrverkeri.jpg'` i frågan.

Koordinater till kartfrågor hittar du genom att högerklicka på en plats i Google Maps:
den första raden i menyn är `lat, lng`.

## Poäng

| Typ      | Poäng |
|----------|-------|
| Flerval  | 500–1000 vid rätt svar (snabbare svar ger mer) |
| Fritext  | 1000 vid rätt svar (små stavfel godkänns) |
| Kartnål  | 1000 vid träff, sedan linjärt ner till 0 vid `maxKm` |

Lagets poäng är summan av medlemmarnas poäng. Sätt `teamScoring: 'average'` om lagen är olika stora.

## Bra att veta

- Alla enheter behöver internet, men de behöver inte vara på samma wifi.
  Det fungerar säkrast om alla sitter på samma wifi.
- Testa i förväg med länken **”öppna testspelare”** i lobbyn. Den öppnar en spelare i en ny flik,
  och du kan öppna flera.
- PeerJS gratisserver används bara för att mobilen och TV:n ska hitta varandra. Svaren går sedan direkt mellan enheterna.
- Kartan kommer från OpenStreetMap, vars kartbilder är fria att använda i liten skala som den här.
