/* inhalt.js — alles, was auf der Seite über dich steht.
 *
 * Jede Angabe hat einen Zustand:
 *   "ok"       steht fest
 *   "offen"    fehlt noch — solange bleibt die Stelle auf der Seite einfach weg
 *              (`ersatz` ist nur der blasse Hinweis im Eingabefeld)
 *   "pruefen"  ist ein Entwurf von Claude — stimmt das so für dich?
 * Dazu zwei Schalter:
 *   pflicht: true      muss vor dem Veröffentlichen ausgefüllt sein
 *   freiwillig: true   darf leer bleiben und zählt dann nicht als offen
 *
 * Du musst diese Datei nicht anfassen: Auf der Seite unten rechts auf
 * „Entwurf“ klicken und eintragen. Das merkt sich nur dieser eine Browser.
 * Mit „Für Claude kopieren“ gibst du mir die Angaben, dann schreibe ich
 * sie hier fest hinein — erst dann sehen sie auch Besucher und dein Handy.
 */
window.INHALT = {
  // Solange das false ist, steht im Fuß der Seite „Entwurf · noch nicht veröffentlicht“.
  veroeffentlicht: false,

  gruppen: ['Wer du bist', 'Kontakt', 'Das Erstgespräch', 'Deine Antworten', 'Pflichtangaben'],
  felder: {
    // ------------------------------------------------------ Wer du bist
    vorname: { gruppe: 0, name: 'Vorname', wert: 'Max', status: 'ok' },
    nachname: {
      gruppe: 0, name: 'Nachname', wert: '', ersatz: 'Nachname', status: 'offen', pflicht: true,
      hinweis: 'So, wie er im Impressum stehen soll.',
    },
    titel: {
      gruppe: 0, name: 'Berufsbezeichnung', wert: 'Vermögensberatung', status: 'pruefen',
      hinweis: 'Steht unter deinem Namen und ganz oben auf der Seite. Nimm die Bezeichnung, die du offiziell führen darfst.',
    },
    ort: {
      gruppe: 0, name: 'Ort', wert: '', ersatz: 'z. B. Köln', status: 'offen',
      hinweis: 'Stadt oder Region, in der du berätst. Wird eingesetzt in „vor Ort in …“.',
    },
    ueber_text: {
      gruppe: 0, name: 'Über mich', lang: true, status: 'pruefen',
      wert: 'Ich bin Max. Ich helfe Menschen, ihre Finanzen zu ordnen: verständlich, ohne Fachchinesisch und in ihrem Tempo. Mir ist wichtig, dass du jede Entscheidung selbst verstehst, bevor du sie triffst.',
      hinweis: 'Ersetz das durch drei, vier ehrliche Sätze in deinen Worten: Wie bist du zur Finanzberatung gekommen? Was willst du anders machen?',
    },

    // ---------------------------------------------------------- Kontakt
    telefon: {
      gruppe: 1, name: 'Telefon', wert: '', ersatz: 'z. B. 0151 23456789', status: 'offen',
      hinweis: 'Mit Vorwahl. Solange das leer ist, gibt es keinen Knopf „Anrufen“.',
    },
    whatsapp: {
      gruppe: 1, name: 'WhatsApp-Nummer', wert: '', ersatz: 'leer lassen = kein WhatsApp-Knopf', status: 'offen', freiwillig: true,
      hinweis: 'Nur ausfüllen, wenn Kunden dir dort schreiben sollen.',
    },
    email: {
      gruppe: 1, name: 'E-Mail', wert: '', ersatz: 'deine Adresse', status: 'offen', pflicht: true,
      hinweis: 'An diese Adresse geht auch das Kontaktformular. Ohne sie kann das Formular nichts verschicken.',
    },
    termin_link: {
      gruppe: 1, name: 'Link zur Terminbuchung', wert: '', ersatz: 'leer lassen = Knopf führt zum Kontakt', status: 'offen', freiwillig: true,
      hinweis: 'Nur falls du ein Buchungswerkzeug nutzt.',
    },

    // ------------------------------------------------- Das Erstgespräch
    gespraech_dauer: {
      gruppe: 2, name: 'Dauer des Erstgesprächs', wert: '20 Minuten', status: 'pruefen',
      hinweis: 'Steht für sich allein, zum Beispiel „20 Minuten“ oder „Eine halbe Stunde“.',
    },
    gespraech_preis: {
      gruppe: 2, name: 'Was es kostet', wert: 'kostenlos und unverbindlich', status: 'pruefen',
      hinweis: 'Wird eingesetzt in „Es ist …“, also zum Beispiel „kostenlos“ oder „kostenlos und unverbindlich“. Nur stehen lassen, wenn es stimmt.',
    },

    // -------------------------------------------------- Deine Antworten
    antwort_verguetung: {
      gruppe: 3, name: 'Antwort: „Wovon lebst du dann?“', lang: true, status: 'pruefen',
      wert: 'Von Provisionen. Schließt du über mich etwas ab, zahlt mir die Gesellschaft eine Provision. Die steckt in den Kosten des Vertrags – du zahlst sie also mit. Was der Vertrag kostet, siehst du vorher im Angebot.',
      hinweis: 'Die Frage kommt immer. Eine klare Antwort schafft mehr Vertrauen als jede Werbung.',
    },
    antwort_unabhaengig: {
      gruppe: 3, name: 'Antwort: „Bist du unabhängig?“', lang: true, status: 'pruefen',
      wert: 'Nein, und das sollst du wissen. Ich arbeite mit festen Partnergesellschaften und vermittle deren Produkte, nicht den ganzen Markt. Dafür kenne ich diese Produkte genau – und ich sage dir auch, wenn dein bestehender Vertrag der bessere ist.',
      hinweis: 'Bitte mit deiner Gesellschaft abstimmen. Das ist der Satz zum Interessenkonflikt.',
    },
    antwort_daten: {
      gruppe: 3, name: 'Antwort: „Was passiert mit meinen Daten?“', lang: true, status: 'pruefen',
      wert: 'Ich nutze sie nur für deine Beratung. Schließt du etwas ab, gehen die nötigen Angaben an die jeweilige Gesellschaft – das siehst du vorher. Diese Seite selbst sammelt nichts: keine Cookies, keine Auswertung, keine fremden Dienste.',
      hinweis: 'Den ersten Teil bitte mit deiner Gesellschaft abstimmen. Der letzte Satz stimmt, solange du nichts Fremdes in die Seite einbaust.',
    },

    // --------------------------------------------------- Pflichtangaben
    strasse: { gruppe: 4, name: 'Straße und Hausnummer', wert: '', ersatz: 'Geschäftsanschrift', status: 'offen', pflicht: true, hinweis: 'Fürs Impressum.' },
    plz_ort: { gruppe: 4, name: 'PLZ und Ort', wert: '', ersatz: 'PLZ Ort', status: 'offen', pflicht: true },
    taetig_fuer: {
      gruppe: 4, name: 'Tätig für', wert: '', ersatz: 'Name der Gesellschaft', status: 'offen', pflicht: true,
      hinweis: 'Für welche Gesellschaft du als selbstständiger Vermittler tätig bist.',
    },
    erlaubnis: {
      gruppe: 4, name: 'Erlaubnis und Status', wert: '', status: 'offen', pflicht: true,
      ersatz: 'Art der Erlaubnis nach der Gewerbeordnung',
      hinweis: 'Steht in deinen Vertragsunterlagen. Nenne alle Erlaubnisse, die zu den sechs Themen auf der Seite gehören. Ein Thema ohne Erlaubnis sollte von der Seite verschwinden.',
    },
    register: {
      gruppe: 4, name: 'Registernummer', wert: '', ersatz: 'Nummer im Vermittlerregister', status: 'offen', pflicht: true,
      hinweis: 'Nachzuschlagen unter www.vermittlerregister.info.',
    },
    aufsicht: { gruppe: 4, name: 'Zuständige Kammer', wert: '', ersatz: 'zuständige Industrie- und Handelskammer', status: 'offen', pflicht: true },
    verguetung_pflicht: {
      gruppe: 4, name: 'Erstinformation: Wie du bezahlt wirst', lang: true, wert: '', status: 'offen', pflicht: true,
      ersatz: 'Wortlaut deiner Gesellschaft',
      hinweis: 'Der verbindliche Satz für die Erstinformation. Bitte von deiner Gesellschaft übernehmen, nicht selbst formulieren.',
    },
    schlichtung: {
      gruppe: 4, name: 'Erstinformation: Schlichtungsstellen', lang: true, wert: '', status: 'offen', pflicht: true,
      ersatz: 'Wortlaut deiner Gesellschaft',
      hinweis: 'An wen sich Kunden bei Streit wenden können. Wortlaut von deiner Gesellschaft übernehmen.',
    },
    hosting: {
      gruppe: 4, name: 'Wo die Seite liegt', wert: 'GitHub Pages (GitHub, Inc., USA)', status: 'pruefen',
      hinweis: 'Gehört in die Datenschutzerklärung. Stimmt für die Vorschau bei GitHub. Zieht die Seite um, hier ändern.',
    },
  },

  // Die sechs Fäden: stehen in der Bühne und unten als Karten.
  faeden: [
    { name: 'Einkommen absichern', text: 'Deine Arbeitskraft ist meist das Wertvollste, was du hast. Was passiert, wenn sie ausfällt?', frage: 'Wovon lebe ich, wenn ich ein Jahr nicht arbeiten kann?' },
    { name: 'Gesundheit & Haftung', text: 'Die großen Risiken zuerst: Krankheit, Unfall und der Schaden, den du jemand anderem zufügst.', frage: 'Welche Versicherungen brauche ich wirklich – und welche nicht?' },
    { name: 'Altersvorsorge', text: 'Die gesetzliche Rente ist ein Fundament, kein fertiges Haus. Je früher du anfängst, desto kleiner die Raten.', frage: 'Wie groß ist meine Lücke – in Euro, nicht in Prozent?' },
    { name: 'Vermögensaufbau', text: 'Regelmäßig, breit gestreut, auf lange Sicht. Klingt langweilig, ist aber der Plan. Eine Garantie gibt es dabei nicht.', frage: 'Wie viel sollte ich im Monat zurücklegen?' },
    { name: 'Eigenheim', text: 'Kaufen oder mieten ist eine Rechenaufgabe und keine Glaubensfrage. Rechnen wir sie durch.', frage: 'Wie viel Haus kann ich mir leisten?' },
    { name: 'Förderung & Zuschüsse', text: 'Zulagen vom Staat, Zuschüsse vom Arbeitgeber, vermögenswirksame Leistungen: Geld, das viele liegen lassen.', frage: 'Was steht mir zu, das ich nicht abrufe?' },
  ],

  // Zahlen mit Quelle. Recherche vom 12.10.2026 (videos/rente-vorsorge/quellen.md).
  zahlen: [
    {
      wert: '48 %', titel: 'Rentenniveau 2026',
      text: 'Das vergleicht eine Musterrente nach 45 Jahren Durchschnittsverdienst mit dem Durchschnittslohn, beide nach Sozialabgaben und vor Steuern. Es heißt nicht: 48 % deines letzten Gehalts.',
      quelle: 'Deutsche Rentenversicherung, „Rentenversicherung in Zahlen 2026“, S. 27',
    },
    {
      wert: '1.195 €', titel: 'Altersrente im Schnitt',
      text: 'Ausgezahlt im Monat, nach Kranken- und Pflegeversicherung, vor Steuern. Stand 31.12.2025.',
      quelle: '„Rentenversicherung in Zahlen 2026“, S. 34/35',
    },
    {
      wert: '20,7 Jahre', titel: 'So lange wird eine Rente gezahlt',
      text: 'Im Schnitt, bei Renten, die 2025 endeten. 1960 waren es in Westdeutschland 9,9 Jahre – heute also gut doppelt so lange.',
      quelle: '„Rentenversicherung in Zahlen 2026“, S. 66',
    },
    {
      wert: 'rund 740 €', titel: 'Kaufkraft von 1.000 € in 20 Jahren',
      text: 'Rechenbeispiel der Rentenversicherung bei 1,5 % Inflation im Jahr.',
      quelle: 'Deutsche Rentenversicherung, „Die Renteninformation – mehr wissen“, 22. Auflage (2/2026), Abschnitt „Der Kaufkraftverlust“',
    },
  ],
};
