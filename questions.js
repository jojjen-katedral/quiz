// =============================================================
//  FRÅGOR – redigera den här filen för att göra ett eget quiz
// =============================================================
//  Tre frågetyper:
//
//  { type: 'choice', text, options: [...], answer: <index, 0 = första>, time }
//      Flerval. Rätt svar ger 500–1000 p beroende på hur snabbt man svarar.
//
//  { type: 'text', text, answer: 'Rätt svar', accept: ['andra', 'godkända'], time }
//      Fritext. Små stavfel godkänns automatiskt. På TV:n kan du klicka på
//      ett svar för att ändra rätt/fel. Rätt svar ger 1000 p.
//
//  { type: 'map', text, target: { lat, lng, name }, center: [lat, lng], zoom, maxKm, time }
//      Kartnål. 1000 p för pricksäkert, sedan linjärt ner till 0 p vid maxKm.
//      center/zoom styr hur kartan startar på mobilen.
//
//  Alla typer kan ha  image: 'bilder/nagot.jpg'  som visas på TV:n.
//  time = sekunder att svara.
// =============================================================

window.QUIZ = {
  title: 'Nyårsquiz 2026',
  teams: ['Raketerna', 'Bubbelgänget'],   // 2–4 lag
  teamScoring: 'sum',                     // 'sum' eller 'average' (bra om lagen är olika stora)

  questions: [
    {
      type: 'choice',
      text: 'I vilket land firas nyår allra först?',
      options: ['Nya Zeeland', 'Kiribati', 'Japan', 'Australien'],
      answer: 1,
      time: 20
    },
    {
      type: 'map',
      text: 'Var släpps den berömda nyårskulan vid midnatt?',
      target: { lat: 40.7580, lng: -73.9855, name: 'Times Square, New York' },
      center: [35, -20],
      zoom: 2,
      maxKm: 3000,
      time: 40
    },
    {
      type: 'text',
      text: 'Vilken dikt läses traditionellt upp på Skansen vid tolvslaget?',
      answer: 'Nyårsklockan',
      accept: ['ring klocka ring'],
      time: 30
    },
    {
      type: 'choice',
      text: 'Hur många vindruvor äter man i Spanien vid tolvslaget?',
      options: ['7', '10', '12', '15'],
      answer: 2,
      time: 15
    },
    {
      type: 'map',
      text: 'Peka ut Skansen!',
      target: { lat: 59.3262, lng: 18.1036, name: 'Skansen, Stockholm' },
      center: [62, 16],
      zoom: 4,
      maxKm: 400,
      time: 40
    },
    {
      type: 'text',
      text: 'Vad kallas nyårsafton i Skottland?',
      answer: 'Hogmanay',
      time: 30
    }
  ]
};
