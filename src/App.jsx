import { useState, useMemo, useEffect, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

/*
  ИЛЛЮСТРАТИВНАЯ МОДЕЛЬ кумулятивного риска ЗППП во времени. Не медицинский прогноз.
  Поведение задаётся тремя типами партнёров (постоянные / приходящие / хукапы), у каждого
  своя частота, длительность, презерватив, проверенность и фон среды (ассортативность).
  Вид секса (вагинальный/анальный/оральный × роль) — множитель к β за акт (опора на ВИЧ), практики
  складываются аддитивно: в каждом контакте присутствует каждая выбранная практика.
  Для типа: выживаемость за контакт = ∏ практик (1 − β·множитель·(1 − φ·e)·прививка);
  риск с заражённым партнёром = 1 − (выживаемость_за_контакт)^k;
  × p·фон·(1 − проверенность); вклады перемножаются по всем партнёрам; разворачивается во времени.
  ✓ grounded=true  → опирается на данные (сплошная линия)
  ◌ grounded=false → грубая оценка (пунктир); надёжных per-act чисел нет
*/

// Слейт-палитра (ЗППП) и фиалковая (Беременность) — одинаковый фон/панели, разный акцент.
const CS = { bg:"#0f141a", panel:"#161d26", panel2:"#1b2430", border:"#283442", hi:"#e8edf2", mid:"#9fb0c0", dim:"#64748b", accent:"#f0a500" };
const CP = { bg:"#0f141a", panel:"#161d26", panel2:"#1b2430", border:"#283442", hi:"#e8edf2", mid:"#9fb0c0", dim:"#64748b", accent:"#a78bfa" };
let C = CS; // активная палитра — переключается по режиму в App
let PREG = C.accent; // тематический цвет беременности = активный C.accent
const SEV = { 5:"#ff3b3b", 4:"#ff7b00", 3:"#ffc300", 2:"#b5d600", 1:"#38d9a9" };

const CDC = "CDC";
const WHO = { en: "WHO", ru: "ВОЗ", sr: "SZO" };
// acc уровни — ключи "high"|"low-mid"|"low"; локализуются через L.acc[...]
const STIS = [
  { key: "hiv", label: { en: "HIV", ru: "ВИЧ", sr: "HIV" }, color: "#4dabf7", sev: 5, p: 0.002, beta: 0.0008, e: 0.80, grounded: true,
    treat: { en: "Incurable — lifelong therapy", ru: "Неизлечимо — пожизненная терапия", sr: "Neizlečiv — doživotna terapija" },
    cons: { en: "Untreated → AIDS, immune collapse", ru: "Без лечения — СПИД, иммунный отказ", sr: "Bez lečenja → SIDA, slom imuniteta" },
    acc: "high",
    src: { en: "Per-act transmission: Patel 2014 (CDC) — receptive vaginal 8 per 10,000. Condom ~80% (Cochrane). Anal ~17× riskier.",
      ru: "Передача за акт: Patel 2014 (CDC) — рецепт. вагинальный 8 на 10 000. Презерватив ~80% (Cochrane). Анальный ~в 17 раз опаснее.",
      sr: "Prenos po aktu: Patel 2014 (CDC) — receptivni vaginalni 8 na 10.000. Kondom ~80% (Cochrane). Analni ~17× rizičniji." },
    guide: {
      symptoms: {
        en: "Within 2–4 weeks some infected people get a flu-like syndrome (fever, rash, sore throat, swollen lymph nodes). Then years with no symptoms while immunity is gradually destroyed.",
        ru: "Через 2–4 недели у части заражённых — гриппоподобный синдром (лихорадка, сыпь, боль в горле, увеличение лимфоузлов). Затем годами без симптомов, пока иммунитет постепенно разрушается.",
        sr: "Tokom 2–4 nedelje kod dela zaraženih javlja se sindrom nalik gripu (groznica, osip, bol u grlu, otečeni limfni čvorovi). Zatim godinama bez simptoma dok se imunitet postepeno uništava." },
      treatment: {
        en: "There is no cure, but antiretroviral therapy (a lifelong course of pills) suppresses the virus to undetectable levels — people live long, and when «undetectable» they do not transmit the virus sexually (the «U=U» principle: undetectable = untransmittable). Prevention: pills taken before possible exposure (PrEP, pre-exposure prophylaxis), or an emergency course within 72 h after contact (PEP, post-exposure prophylaxis).",
        ru: "Излечения нет, но антиретровирусная терапия (пожизненный приём таблеток) подавляет вирус до неопределяемого уровня — человек живёт долго и при «неопределяемом» не передаёт вирус половым путём (принцип «Н=Н»: неопределяемый = непередающий). Профилактика: таблетки до возможного контакта (PrEP, доконтактная профилактика) или экстренный курс в течение 72 ч после контакта (PEP, постконтактная профилактика).",
        sr: "Lek ne postoji, ali antiretrovirusna terapija (doživotno uzimanje tableta) potiskuje virus do nedetektabilnog nivoa — osoba živi dugo i pri „nedetektabilnom“ ne prenosi virus polnim putem (princip „U=U“: nedetektabilno = neprenosivo). Prevencija: tablete pre mogućeg kontakta (PrEP, pre-ekspoziciona profilaksa) ili hitni kurs u roku od 72 h posle kontakta (PEP, post-ekspoziciona profilaksa)." },
      consequences: {
        en: "Untreated → AIDS: severe immunodeficiency, opportunistic infections and tumors, death.",
        ru: "Без лечения — СПИД: тяжёлый иммунодефицит, оппортунистические инфекции и опухоли, смерть.",
        sr: "Bez lečenja → SIDA: teška imunodeficijencija, oportunističke infekcije i tumori, smrt." },
      sources: [{ label: CDC, url: "https://www.cdc.gov/hiv/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/hiv-aids" }] } },
  { key: "hpv", label: { en: "HPV", ru: "ВПЧ", sr: "HPV" }, color: "#ff4d6d", sev: 4, p: 0.25, beta: 0.40, e: 0.40, grounded: false,
    vax: { ve: 0.85, note: { en: "More effective before sexual debut; ~90% of oncogenic types, but not all. Estimate.", ru: "Эффективнее до начала половой жизни; ~90% онкогенных типов, но не все. Оценка.", sr: "Efikasnija pre početka polnog života; ~90% onkogenih tipova, ali ne svi. Procena." } },
    treat: { en: "No drug; oncogenic", ru: "Нет лекарства; онкогенен", sr: "Nema leka; onkogen" },
    cons: { en: "Cancer (cervix, throat, anus), warts", ru: "Рак (шейка, горло, анус), кондиломы", sr: "Rak (grlić, grlo, anus), kondilomi" },
    acc: "low",
    src: { en: "Per-act transmission — rough estimate; HPV is highly contagious. Condom ~40% (CDC). Vaccine protects.",
      ru: "Передача за акт — грубая оценка; ВПЧ очень заразен. Презерватив ~40% (CDC). Защищает прививка.",
      sr: "Prenos po aktu — gruba procena; HPV je veoma zarazan. Kondom ~40% (CDC). Vakcina štiti." },
    guide: {
      symptoms: {
        en: "Most often no symptoms; in 9 of 10 cases the infection clears on its own within ~2 years. Some types cause genital warts; oncogenic types are silent and found by screening.",
        ru: "Чаще всего бессимптомно; в 9 из 10 случаев инфекция уходит сама за ~2 года. Некоторые типы дают генитальные кондиломы (бородавки); онкогенные типы протекают скрыто и выявляются скринингом.",
        sr: "Najčešće bez simptoma; u 9 od 10 slučajeva infekcija prolazi sama za ~2 godine. Neki tipovi izazivaju genitalne kondilome (bradavice); onkogeni tipovi teku skriveno i otkrivaju se skriningom." },
      treatment: {
        en: "There is no drug against the virus itself — manifestations are treated: warts are removed, precancerous cervical changes are monitored and treated. Reliably prevented by vaccine (best before sexual debut).",
        ru: "Лекарства от самого вируса нет — лечат проявления: кондиломы удаляют, предраковые изменения шейки матки наблюдают и лечат. Надёжно предотвращается вакциной (лучше всего до начала половой жизни).",
        sr: "Leka protiv samog virusa nema — leče se manifestacije: kondilomi se uklanjaju, predkancerozne promene grlića materice prate se i leče. Pouzdano se sprečava vakcinom (najbolje pre početka polnog života)." },
      consequences: {
        en: "Oncogenic types cause cervical cancer, as well as cancer of the anus, oropharynx, penis, vulva and vagina.",
        ru: "Онкогенные типы вызывают рак шейки матки, а также рак ануса, ротоглотки, полового члена, вульвы и влагалища.",
        sr: "Onkogeni tipovi izazivaju rak grlića materice, kao i rak anusa, ždrela, penisa, vulve i vagine." },
      sources: [{ label: CDC, url: "https://www.cdc.gov/sti/about/about-genital-hpv-infection.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/human-papilloma-virus-and-cancer" }] } },
  { key: "hbv", label: { en: "Hepatitis B", ru: "Гепатит B", sr: "Hepatitis B" }, color: "#94d82d", sev: 4, p: 0.003, beta: 0.03, e: 0.90, grounded: false,
    vax: { ve: 0.95, note: { en: "With an immune response ~95%, infection is nearly ruled out. Estimate.", ru: "При иммунном ответе ~95%, заражение почти исключено. Оценка.", sr: "Uz imuni odgovor ~95%, zaraza je gotovo isključena. Procena." } },
    treat: { en: "Chronic incurable; vaccine exists", ru: "Хронический неизлечим; есть прививка", sr: "Hronični neizlečiv; postoji vakcina" },
    cons: { en: "Cirrhosis, liver cancer if chronic", ru: "Цирроз, рак печени при хронизации", sr: "Ciroza, rak jetre pri hroničnom toku" },
    acc: "low",
    src: { en: "Per-act transmission — rough estimate. Condom ~90%. Depends on vaccination.",
      ru: "Передача за акт — грубая оценка. Презерватив ~90%. Зависит от прививки.",
      sr: "Prenos po aktu — gruba procena. Kondom ~90%. Zavisi od vakcinacije." },
    guide: {
      symptoms: {
        en: "Often no symptoms. Acute phase: fatigue, nausea, abdominal pain, dark urine, jaundice. The younger the infected person, the higher the chance of becoming chronic.",
        ru: "Часто бессимптомно. Острая фаза: усталость, тошнота, боль в животе, тёмная моча, желтуха. Чем младше заразившийся, тем выше шанс перехода в хроническую форму.",
        sr: "Često bez simptoma. Akutna faza: umor, mučnina, bol u stomaku, tamna mokraća, žutica. Što je zaražena osoba mlađa, to je veća šansa za prelazak u hronični oblik." },
      treatment: {
        en: "Acute hepatitis usually resolves on its own; chronic is incurable but controlled with antivirals. Reliably prevented by vaccination.",
        ru: "Острый гепатит обычно проходит сам; хронический неизлечим, но контролируется противовирусными препаратами. Надёжно предотвращается вакцинацией.",
        sr: "Akutni hepatitis obično prolazi sam; hronični je neizlečiv, ali se kontroliše antivirusnim lekovima. Pouzdano se sprečava vakcinacijom." },
      consequences: {
        en: "Chronic infection over time → cirrhosis and liver cancer.",
        ru: "Хроническая инфекция со временем → цирроз и рак печени.",
        sr: "Hronična infekcija vremenom → ciroza i rak jetre." },
      sources: [{ label: CDC, url: "https://www.cdc.gov/hepatitis-b/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/hepatitis-b" }] } },
  { key: "hcv", label: { en: "Hepatitis C", ru: "Гепатит C", sr: "Hepatitis C" }, color: "#748ffc", sev: 3, p: 0.005, beta: 0.0002, e: 0.70, grounded: false,
    treat: { en: "Curable (~95%)", ru: "Излечим (~95%)", sr: "Izlečiv (~95%)" },
    cons: { en: "Cirrhosis, liver cancer untreated", ru: "Цирроз, рак печени без лечения", sr: "Ciroza, rak jetre bez lečenja" },
    acc: "low",
    src: { en: "Mostly bloodborne; sexual transmission low and estimated. Curable (~95%).",
      ru: "В основном через кровь; сексуальная передача низкая и оценочная. Излечим (~95%).",
      sr: "Uglavnom preko krvi; polni prenos je nizak i procenjen. Izlečiv (~95%)." },
    guide: {
      symptoms: {
        en: "Usually no symptoms for years; sometimes fatigue, jaundice. Many do not know they are infected, so testing matters.",
        ru: "Обычно бессимптомно годами; иногда усталость, желтуха. Многие не знают, что заражены, поэтому важен анализ.",
        sr: "Obično bez simptoma godinama; ponekad umor, žutica. Mnogi ne znaju da su zaraženi, zato je analiza važna." },
      treatment: {
        en: "Curable: a course of direct-acting antivirals (DAA) gives ~95% cure in 8–12 weeks. No vaccine. Transmitted mainly via blood, sexual route less often.",
        ru: "Излечим: курс противовирусных прямого действия (DAA) даёт ~95% выздоровления за 8–12 недель. Вакцины нет. Передаётся в основном через кровь, половой путь — реже.",
        sr: "Izlečiv: kurs direktno delujućih antivirusnih lekova (DAA) daje ~95% izlečenja za 8–12 nedelja. Vakcine nema. Prenosi se uglavnom preko krvi, polnim putem ređe." },
      consequences: {
        en: "Untreated → cirrhosis, liver failure, liver cancer.",
        ru: "Без лечения — цирроз, печёночная недостаточность, рак печени.",
        sr: "Bez lečenja → ciroza, otkazivanje jetre, rak jetre." },
      sources: [{ label: CDC, url: "https://www.cdc.gov/hepatitis-c/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/hepatitis-c" }] } },
  { key: "syp", label: { en: "Syphilis", ru: "Сифилис", sr: "Sifilis" }, color: "#cc5de8", sev: 3, p: 0.004, beta: 0.10, e: 0.60, grounded: false,
    treat: { en: "Curable (penicillin)", ru: "Излечим (пенициллин)", sr: "Izlečiv (penicilin)" },
    cons: { en: "Brain, heart, nervous-system damage (tertiary)", ru: "Поражение мозга, сердца, нервной системы (третичный)", sr: "Oštećenje mozga, srca, nervnog sistema (tercijarni)" },
    acc: "low-mid",
    src: { en: "Per-act transmission — estimate; the chancre is often outside the condom area. Condom ~50–71% (CDC).",
      ru: "Передача за акт — оценка; шанкр часто вне зоны презерватива. Презерватив ~50–71% (CDC).",
      sr: "Prenos po aktu — procena; šankr je često van zone kondoma. Kondom ~50–71% (CDC)." },
    guide: {
      symptoms: {
        en: "Staged course. Primary: a painless sore (chancre) at the infection site. Secondary: rash (often on palms and soles), fever, swollen lymph nodes. Then a latent stage with no symptoms.",
        ru: "Стадийное течение. Первичный: безболезненная язва (шанкр) в месте заражения. Вторичный: сыпь (часто на ладонях и стопах), температура, увеличение лимфоузлов. Затем латентная стадия без симптомов.",
        sr: "Tok po stadijumima. Primarni: bezbolna rana (šankr) na mestu zaraze. Sekundarni: osip (često na dlanovima i tabanima), temperatura, otečeni limfni čvorovi. Zatim latentni stadijum bez simptoma." },
      treatment: {
        en: "Curable with an antibiotic (penicillin). The earlier treatment starts, the simpler; tertiary-stage damage is irreversible.",
        ru: "Излечим антибиотиком (пенициллин). Чем раньше начато лечение, тем проще; повреждения третичной стадии необратимы.",
        sr: "Izlečiv antibiotikom (penicilin). Što se ranije počne s lečenjem, to je jednostavnije; oštećenja tercijarnog stadijuma su nepovratna." },
      consequences: {
        en: "Untreated, after years → tertiary syphilis: damage to the heart, brain and nervous system; in pregnancy — congenital syphilis in the baby.",
        ru: "Без лечения через годы — третичный сифилис: поражение сердца, мозга и нервной системы; при беременности — врождённый сифилис у ребёнка.",
        sr: "Bez lečenja nakon godina → tercijarni sifilis: oštećenje srca, mozga i nervnog sistema; u trudnoći — urođeni sifilis kod deteta." },
      sources: [{ label: CDC, url: "https://www.cdc.gov/syphilis/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/syphilis" }] } },
  { key: "gon", label: { en: "Gonorrhea", ru: "Гонорея", sr: "Gonoreja" }, color: "#ff922b", sev: 2, p: 0.008, beta: 0.20, e: 0.90, grounded: false,
    treat: { en: "Curable; resistance rising", ru: "Излечима; растёт устойчивость", sr: "Izlečiva; raste otpornost" },
    cons: { en: "Infertility, pelvic inflammation, spread to blood", ru: "Бесплодие, воспаление малого таза, заражение крови", sr: "Neplodnost, zapaljenje karlice, širenje u krv" },
    acc: "low",
    src: { en: "Per-act transmission — rough estimate; condom >90% (CDC). Growing antibiotic resistance.",
      ru: "Передача за акт — грубая оценка; презерватив >90% (CDC). Растёт устойчивость к антибиотикам.",
      sr: "Prenos po aktu — gruba procena; kondom >90% (CDC). Raste otpornost na antibiotike." },
    guide: {
      symptoms: {
        en: "Often asymptomatic (especially in women). Possible: burning on urination, discharge (mucus, pus), in women — bleeding between cycles. Rectal and pharyngeal forms occur.",
        ru: "Часто бессимптомна (особенно у женщин). Возможны: жжение при мочеиспускании, выделения (бели, гной), у женщин — кровотечения между циклами. Бывает ректальная и глоточная формы.",
        sr: "Često bez simptoma (naročito kod žena). Moguće: pečenje pri mokrenju, sekret (sluz, gnoj), kod žena — krvarenje između ciklusa. Javljaju se rektalni i ždrelni oblici." },
      treatment: {
        en: "Curable with an antibiotic (ceftriaxone injection), but drug resistance is rising — treat strictly as prescribed by a doctor.",
        ru: "Излечима антибиотиком (инъекция цефтриаксона), но устойчивость к препаратам растёт — лечение строго по назначению врача.",
        sr: "Izlečiva antibiotikom (injekcija ceftriaksona), ali otpornost na lekove raste — lečenje strogo po preporuci lekara." },
      consequences: {
        en: "Untreated → pelvic inflammatory disease (inflammation of the uterus and tubes), infertility, ectopic pregnancy; may spread to blood and joints; raises the risk of HIV infection.",
        ru: "Без лечения — воспалительные заболевания органов малого таза (воспаление матки и труб), бесплодие, внематочная беременность; может распространиться в кровь и суставы; повышает риск заражения ВИЧ.",
        sr: "Bez lečenja → zapaljenska bolest male karlice (zapaljenje materice i jajovoda), neplodnost, vanmaterična trudnoća; može se proširiti u krv i zglobove; povećava rizik od zaraze HIV-om." },
      sources: [{ label: CDC, url: "https://www.cdc.gov/gonorrhea/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/sexually-transmitted-infections-(stis)" }] } },
  { key: "chl", label: { en: "Chlamydia", ru: "Хламидия", sr: "Hlamidija" }, color: "#ffd43b", sev: 2, p: 0.045, beta: 0.10, e: 0.70, grounded: false,
    treat: { en: "Curable with antibiotic", ru: "Излечима антибиотиком", sr: "Izlečiva antibiotikom" },
    cons: { en: "Infertility, pelvic inflammation (often silent)", ru: "Бесплодие, воспаление малого таза (часто скрыто)", sr: "Neplodnost, zapaljenje karlice (često skriveno)" },
    acc: "low-mid",
    src: { en: "Per-act transmission — estimate; often asymptomatic. Condom 50–90% (CDC).",
      ru: "Передача за акт — оценка; часто бессимптомна. Презерватив 50–90% (CDC).",
      sr: "Prenos po aktu — procena; često bez simptoma. Kondom 50–90% (CDC)." },
    guide: {
      symptoms: {
        en: "Often asymptomatic. Possible discharge, burning on urination, lower-abdominal pain; symptoms may appear only after several weeks.",
        ru: "Часто бессимптомна. Возможны выделения, жжение при мочеиспускании, боль внизу живота; симптомы могут появиться лишь через несколько недель.",
        sr: "Često bez simptoma. Mogući sekret, pečenje pri mokrenju, bol u donjem delu stomaka; simptomi se mogu pojaviti tek nakon nekoliko nedelja." },
      treatment: {
        en: "Curable with an antibiotic; it is important to finish the whole course and treat partners, otherwise reinfection.",
        ru: "Излечима антибиотиком; важно пройти весь курс и пролечить партнёров, иначе повторное заражение.",
        sr: "Izlečiva antibiotikom; važno je proći ceo kurs i lečiti partnere, inače ponovna zaraza." },
      consequences: {
        en: "Untreated → pelvic inflammatory disease (inflammation of the uterus and tubes), scarring of the fallopian tubes, infertility, ectopic pregnancy.",
        ru: "Без лечения — воспалительные заболевания органов малого таза (воспаление матки и труб), рубцевание маточных труб, бесплодие, внематочная беременность.",
        sr: "Bez lečenja → zapaljenska bolest male karlice (zapaljenje materice i jajovoda), ožiljci na jajovodima, neplodnost, vanmaterična trudnoća." },
      sources: [{ label: CDC, url: "https://www.cdc.gov/chlamydia/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/sexually-transmitted-infections-(stis)" }] } },
  { key: "tri", label: { en: "Trichomoniasis", ru: "Трихомониаз", sr: "Trihomonijaza" }, color: "#20c997", sev: 1, p: 0.02, beta: 0.12, e: 0.50, grounded: false,
    treat: { en: "Curable in one course", ru: "Излечим одним курсом", sr: "Izlečiv jednim kursom" },
    cons: { en: "Inflammation; raises other STI risk", ru: "Воспаление; повышает риск др. ИППП", sr: "Upala; povećava rizik od drugih PPI" },
    acc: "low",
    src: { en: "Per-act transmission — estimate; condom ~50%. Treated in one course.",
      ru: "Передача за акт — оценка; презерватив ~50%. Лечится одним курсом.",
      sr: "Prenos po aktu — procena; kondom ~50%. Leči se jednim kursom." },
    guide: {
      symptoms: {
        en: "About 70% have no symptoms. Possible: itching, burning, redness, discharge (in women often frothy and smelly), discomfort on urination.",
        ru: "Около 70% — без симптомов. Возможны: зуд, жжение, покраснение, выделения (у женщин нередко пенистые с запахом), дискомфорт при мочеиспускании.",
        sr: "Oko 70% — bez simptoma. Moguće: svrab, pečenje, crvenilo, sekret (kod žena često penušav i sa mirisom), nelagodnost pri mokrenju." },
      treatment: {
        en: "Easily curable: a course of antibiotic (metronidazole or tinidazole); both partners must be treated.",
        ru: "Легко излечим: курс антибиотика (метронидазол или тинидазол); лечить нужно обоих партнёров.",
        sr: "Lako izlečiv: kurs antibiotika (metronidazol ili tinidazol); treba lečiti oba partnera." },
      consequences: {
        en: "Inflammation; raises the risk of acquiring and transmitting other STIs, including HIV; in pregnancy — preterm birth.",
        ru: "Воспаление; повышает риск заражения и передачи других ИППП, включая ВИЧ; при беременности — преждевременные роды.",
        sr: "Upala; povećava rizik od zaraze i prenosa drugih PPI, uključujući HIV; u trudnoći — prevremeni porođaj." },
      sources: [{ label: CDC, url: "https://www.cdc.gov/trichomoniasis/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/sexually-transmitted-infections-(stis)" }] } },
];

// Множитель распространённости по «среде»: обычная (×1) / высокий фон / вспышка — СВОЙ для каждой болезни.
// Инфекции концентрируются в сексуальных сетях, поэтому локальная p бывает много выше средней. Оценки (порядок величины).
const WHO_STI = "https://www.who.int/news-room/fact-sheets/detail/sexually-transmitted-infections-(stis)";
const ENV = {
  hiv: { high: 3, out: 25,
    note: { en: "Average ~0.2%, but HIV concentrates in networks: in key groups (men who have sex with men, people who inject drugs) and high-burden regions a high-activity partner reaches 15–27%.",
      ru: "В среднем ~0,2%, но ВИЧ концентрируется в сетях: в ключевых группах (мужчины, имеющие секс с мужчинами; люди, употребляющие инъекционные наркотики) и регионах с высоким бременем у активного партнёра достигает 15–27%.",
      sr: "U proseku ~0,2%, ali HIV se koncentriše u mrežama: u ključnim grupama (muškarci koji imaju seks sa muškarcima; ljudi koji koriste injekcione droge) i regionima sa visokim teretom kod aktivnog partnera dostiže 15–27%." },
    src: { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/hiv-aids" } },
  hpv: { high: 1.2, out: 1.5,
    note: { en: "Already extremely widespread (~25% at any moment, ~80% over a lifetime), so there is little room to rise and it saturates fast.",
      ru: "Уже распространён крайне широко (~25% в каждый момент, ~80% за жизнь), поэтому расти почти некуда — быстро упирается в потолок.",
      sr: "Već izuzetno raširen (~25% u svakom trenutku, ~80% tokom života), pa ima malo prostora za rast i brzo se zasiti." },
    src: { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/human-papilloma-virus-and-cancer" } },
  hbv: { high: 2.5, out: 6,
    note: { en: "In unvaccinated groups and endemic regions chronic hepatitis B reaches 5–10% and above.",
      ru: "В непривитых группах и эндемичных регионах хронический гепатит B достигает 5–10% и выше.",
      sr: "U nevakcinisanim grupama i endemskim regionima hronični hepatitis B dostiže 5–10% i više." },
    src: { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/hepatitis-b" } },
  hcv: { high: 3, out: 20,
    note: { en: "Explosive in networks of people who inject drugs, where prevalence runs 30–60%.",
      ru: "Взрывной в сетях инъекционных потребителей, где распространённость 30–60%.",
      sr: "Eksplozivan u mrežama injekcionih korisnika, gde je rasprostranjenost 30–60%." },
    src: { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/hepatitis-c" } },
  syp: { high: 2.5, out: 6,
    note: { en: "Resurgent in MSM sexual networks, where prevalence reaches 5–15% during outbreaks.",
      ru: "На подъёме в сексуальных сетях МСМ, где во время вспышек достигает 5–15%.",
      sr: "U porastu u seksualnim mrežama MSM, gde tokom izbijanja dostiže 5–15%." },
    src: { label: WHO, url: WHO_STI } },
  gon: { high: 2, out: 4,
    note: { en: "Outbreak-prone in dense sexual networks (5–15%); antibiotic resistance prolongs spread.",
      ru: "Склонна к вспышкам в плотных сексуальных сетях (5–15%); устойчивость к антибиотикам продлевает распространение.",
      sr: "Sklona izbijanjima u gustim seksualnim mrežama (5–15%); otpornost na antibiotike produžava širenje." },
    src: { label: WHO, url: WHO_STI } },
  chl: { high: 1.2, out: 1.5,
    note: { en: "Already common (~4.5%); in active young networks 10–15%, so the multiplier is modest.",
      ru: "Уже частый (~4,5%); в активных молодёжных сетях 10–15%, поэтому множитель скромный.",
      sr: "Već čest (~4,5%); u aktivnim mladim mrežama 10–15%, pa je množilac skroman." },
    src: { label: WHO, url: WHO_STI } },
  tri: { high: 1.5, out: 2,
    note: { en: "Concentrated in specific populations, where prevalence reaches 10–20%.",
      ru: "Концентрируется в отдельных группах, где распространённость достигает 10–20%.",
      sr: "Koncentriše se u određenim grupama, gde rasprostranjenost dostiže 10–20%." },
    src: { label: WHO, url: WHO_STI } },
};
// Множитель среды для инфекции (1 / high / outbreak).
const envMulOf = (s, level) => { const e = ENV[s.key]; return e ? (level === "high" ? e.high : level === "outbreak" ? e.out : 1) : 1; };
// Подменяем s.p эффективной распространённостью среды — не трогая survivalAt/Breakdown.
const withEnv = (s, level) => {
  const mul = envMulOf(s, level);
  return mul === 1 ? s : { ...s, p: s.p * mul };
};

const ACC_COLOR = { "high": "#38d9a9", "low-mid": "#ffc300", "low": "#ff7b00" };

// Десятичный разделитель: en — точка, ru/sr — запятая.
const dec = (str, lang) => (lang === "en" ? str : str.replace(".", ","));

const pctVal = (x, lang = "en") => {
  if (x <= 0) return "0%";
  if (x >= 10) return Math.round(x) + "%";
  if (x >= 1) return x.toFixed(0) + "%";
  if (x >= 0.1) return dec(x.toFixed(1), lang) + "%";
  const d = Math.max(2, Math.ceil(-Math.log10(x)) + 1);
  return dec(parseFloat(x.toFixed(d)).toString(), lang) + "%";
};
const pctAct = (v, lang = "en") => {
  const x = v * 100;
  if (x <= 0) return "0%";
  if (x >= 10) return Math.round(x) + "%";
  if (x >= 1) return x.toFixed(0) + "%";
  const d = Math.max(2, Math.ceil(-Math.log10(x)) + 1);
  return dec(parseFloat(x.toFixed(d)).toString(), lang) + "%";
};
// Короткие единицы для длительности связи и оси таймлайна.
const U = {
  en: { oneoff: "one-off", wk: "wk", mo: "mo", yr: "y", monoSep: "." },
  ru: { oneoff: "разово", wk: "нед", mo: "мес", yr: "г", monoSep: "," },
  sr: { oneoff: "jednokratno", wk: "ned.", mo: "mes.", yr: "g.", monoSep: "," },
};
const fmtDur = (m, lang = "en") => {
  const u = U[lang] || U.en;
  if (m <= 0) return u.oneoff;
  if (m < 1) return `≈ ${Math.round(m * 4.33)} ${u.wk}`;
  if (m < 12) return `${Math.round(m)} ${u.mo}`;
  return `${dec((Math.round((m / 12) * 10) / 10).toString(), lang)} ${u.yr}`;
};
// Слово «год/years» с числом (плюрализация по языку).
const yearsWord = (n, lang = "en") => {
  if (lang === "en") return n === 1 ? "year" : "years";
  if (lang === "sr") {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "godina";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "godine";
    return "godina";
  }
  // ru
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "год";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "года";
  return "лет";
};
// Короткое «г/y/g.» рядом с числом на оси и в подсказке.
const yrShort = (lang = "en") => (U[lang] || U.en).yr;
const moWord = (lang = "en") => ({ en: "mo", ru: "мес", sr: "mes." }[lang] || "mo");

// ── Локализация (en — дефолт). t(key) читает текущий язык из L. ────────────────
const I18N = {
  en: {
    langName: "English",
    title: "STI risk over time",
    badge: "illustrative model",
    intro: "",
    warnTitle: "This is an amateur calculator, not a medical tool.",
    warnBody: (<>The real probabilities are <b style={{ color: C.accent }}>almost certainly inexact</b>, because the model relies on many assumptions and estimates with wide spreads. Its main use is comparing how different parameters may affect the chance of infection. Don't make medical decisions based on the model — consult a specialist.</>),
    preset: "Behavior preset",
    presetInfo: (<><b>Celibacy</b> — no sex.<br /><b>Monogamy</b> — one steady partner.<br /><b>Serial monogamy</b> — one partner at a time, but they change over the years.<br /><b>Monogamish</b> — mostly one partner + rare hookups.<br /><b>Open / swing</b> — a steady partner plus sex on the side.<br /><b>Polyamory</b> — several ongoing relationships at once.<br /><b>ONS / hookups</b> — one-night stands, no follow-up.<br /><b>Core group</b> — a tight circle with frequent partner turnover.</>),
    sexActs: "Sex acts",
    sexActsInfo: "Which practices and in which role. Per-act risk depends on the practice: receptive anal ≈ ×17 vs vaginal, insertive less, oral notably lower (based on HIV data; rough for other infections). For simplicity we assume every selected practice is present in each contact — so each one you add only raises the risk.",
    noActs: "No practice selected — risk is treated as zero.",
    protection: "Protection and immunity",
    vaxHpv: "Vaccinated against HPV",
    vaxHbv: "Vaccinated against hepatitis B",
    vaccinated: "vaccinated",
    addBtn: "+ add",
    removeCard: "remove (count → 0)",
    shareBtn: "Share risk profile",
    shareDone: "Copied to clipboard!",
    shareHint: "Copy a link that reopens exactly these settings",
    poolInfo: (<>How «active» this partner type's pool is. Hookups come from a more active circle → likelier infected.</>),
    bg: "pool", bgMul: (m) => `pool ×${m}`,
    oneActBg: (m) => `1 act · pool ×${m}`,
    condom: "Condom",
    condomInfo: "Share of acts with partners of this type that use a condom.",
    tested: "Tested",
    testedInfo: "Share of partners of this type whose recent negative test you actually KNOW — only a result you know lowers your risk.",
    details: "details",
    sexPerWeek: "Sex per week",
    sexPerWeekHint: "how often sex happens with one such partner",
    relDuration: "Relationship duration",
    relDurationHint: "how long one such relationship lasts",
    oneoffNote: "One-off contact — one act per partner.",
    ongoingNote: "Lasts the whole period — exposure accumulates over time.",
    horizon: "Active sex-life period",
    horizonHint: "",
    scale: "Probability scale",
    scaleHint: "",
    atLeastOne: "at least one of the enabled",
    envLabel: "Environment",
    envNormal: "normal", envHigh: "high background", envOutbreak: "outbreak",
    envInfo: (<>Infections cluster in sexual networks, so a partner is likelier infected than the population average. The switch scales each infection's prevalence — its own factor, see the disease card.<br /><br /><b>High background</b> — a more active, higher-risk circle.<br /><b>Outbreak</b> — a concentrated network during an active epidemic.<br /><br />Illustrative estimates, not a prediction.</>),
    envGuideLabel: "Risk environment (prevalence ×)",
    anyLabel: "At least one",
    topRiskLine: (years, yw, name, pct, col) => (<>Over {years} {yw} of active sex life, the highest risk is <span style={{ color: col, fontWeight: 600 }}>{name}</span> — about <span style={{ color: C.hi, fontWeight: 600 }}>{pct}</span>.</>),
    enableOne: "Enable at least one infection below.",
    structTitle: "Partnership structure over time",
    structStats: (avg, lanes, total) => (<>sex ≈ <b data-hi>{avg}×</b>/wk · peak <b data-hi>{lanes}</b> · total relationships: <b data-hi>{total}</b></>),
    legSteady: "steady", legCasual: "recurring", legHookup: "hookups",
    structLegendTail: "",
    noPartners: "No partners — add some in the cards on the left.",
    shownPart: (total) => `part of the relationships shown for clarity — statistics over all ${total}`,
    perWk: "/wk",
    thInfection: "Infection",
    thRisk: (years, yw) => `Risk over ${years} ${yw}`,
    thPerAct: "Per act: without → with condom",
    thTreatment: "Treatment",
    thConsequences: "Consequences",
    thSource: "Source",
    accuracyLab: "Accuracy",
    acc: { "high": "high", "low-mid": "low–medium", "low": "low" },
    sourcesLab: "Sources",
    guideTail: "",
    sympt: "Symptoms", treatm: "Treatment", conseq: "Consequences",
    collapseGuide: "collapse guide", openGuide: "open the disease guide",
    breakdownTitle: "Calculation breakdown — where the number comes from",
    breakdownIntro: "",
    condomBlockTitle: "What a condom gives (if used in every contact with everyone)",
    withoutCondom: "without condom", withCondom: "with condom",
    barAct: "Per 1 contact (all practices, if the partner is infected)",
    barHor: (years, yw) => `Over ${years} ${yw}`,
    satDrop: (years, yw, cutAct, cutHor) => (<>Per <b data-hi>one contact</b> a condom removes <b data-grn>{cutAct}%</b> of the risk. But over <b data-hi>{years} {yw}</b> with repeats — only <b data-red>{cutHor}%</b>: with many contacts the risk «saturates», and relative protection falls.</>),
    satFlat: (years, yw, cutHor) => (<>Both per <b data-hi>one contact</b> and over <b data-hi>{years} {yw}</b> a condom removes about the same (~<b data-grn>{cutHor}%</b>). For rarely transmitted infections the risk does not «saturate», so relative protection does not fall over time.</>),
    contribIntro: (years, yw) => (<>The contribution of each <b data-hi>partner type</b> over {years} {yw} (its own frequency, duration, condom, tested share, background), then they combine:</>),
    thType: "Type", thPartners: "Partners", thContacts: "Contacts k", thTransPerAct: "Transmission per contact", thChanceInf: "Chance partner infected", thRiskHor: (years, yw) => `Risk over ${years} ${yw}`,
    perYear: "/yr",
    noActivePartners: "No active partners — add someone in the cards on the left to see the breakdown.",
    thContactsInfo: (<><b data-hi>Sex acts with one partner</b> of this type over the period.<br />Formula: <span data-f>sex/week × 52/12 × duration (months)</span>; a hookup = 1 act.</>),
    thTransPerActInfo: (<><b data-hi>Transmission in one contact</b>, if the partner is infected.<br />Combines the selected sex acts; already includes this type's condom and vaccine.<br />Formula: <span data-f>1 − ∏(1 − β·practice·(1 − condom·e))</span> over the selected practices.</>),
    thChanceInfInfo: (<><b data-hi>Chance the partner is already infected.</b><br />Formula: <span data-f>prevalence × environment × pool × (1 − tested)</span>.</>),
    thRiskHorInfo: (<><b data-hi>This type's risk over the period.</b><br />From one partner: <span data-f>1 − (1 − chance_infected × transmission_over_all_contacts)</span>, raised to the power of the partner count.<br />The types are then combined in the «Total» row below.</>),
    thTotal: "Total",
    thTotalInfo: (<><b data-hi>The final risk — the height of the curve.</b><br />The types are independent, so they combine: <span data-f>total = 1 − product of «not infected» across all types</span>.</>),
    assumTitle: "Assumptions and how this is computed",
    assumP1: (<>Only for <b data-hi>HIV</b> are per-act transmission and condom effectiveness taken from research (solid line). For the others there are no reliable numbers — these are order-of-magnitude estimates (dashed) based on CDC and WHO; the source for each infection is in the «Source» column of the table.</>),
    assumP2: (<><b data-hi>Partner types.</b> Behavior is set by three types — steady, recurring, hookups. For each you can separately set how often a condom is used and how much you know about partners' test status. Each type also has its own multiplier for the chance a partner is already infected — different partners come from circles of different activity: steady ×1, recurring ×2, hookups ×4. Estimated from surveys: among casual and once-off partners prevalence runs several times higher than among steady ones (≈×3–7; <a href="https://pubmed.ncbi.nlm.nih.gov/1411843/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "underline" }}>casual vs steady ↗</a>, <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5737755/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "underline" }}>once-off prevalence ↗</a>). The multiplier is relative — the overall community level is set by «Environment», and the two multiply without double-counting.</>),
    assumP3: (<><b data-hi>Sex acts add up.</b> We assume every selected practice is present in each contact, so adding one only raises the risk (a simplification — not always true in reality). The risk ratios rely on HIV; for other infections this is a rough approximation.</>),
    assumP4: (<><b data-hi>Tested share.</b> A test has a «window» between infection and a positive result, so even 100% tested does not guarantee zero — it's an estimate.</>),
    assumP5: (<><b data-hi>Partner pool.</b> Estimates how much more active this type's circle is, and therefore how much likelier the partner is already infected. Relative multipliers (steady &lt; recurring &lt; hookups), not exact values.</>),
    assumP6: (<><b data-hi>How it's computed.</b> Per type the number of contacts is <span data-f>k = frequency × duration</span> (hookup = 1). The chance of catching it from a partner grows with k and is multiplied by the chance the partner is infected. The contributions of all types multiply → cumulative risk rises over time. The exact per-column formulas are in the breakdown tooltips.</>),
    assumPEnv: (<><b data-hi>Environment.</b> The partner-type multiplier reflects the circle of a specific partner, while «Environment» shifts the whole community baseline: normal / high background / outbreak — its own multiplier on each infection's prevalence (values and sources on the disease cards). The type picks the partner's circle, the environment sets the overall level; together they give «chance the partner is infected» = <span data-f>prevalence × environment × pool</span>, with no double-counting. Example (HIV): in an outbreak, core-group prevalence is roughly 100× the average, but part of that is already carried by the partner-type multiplier (hookup ×4), so for the environment we use ×25 — together <span data-f>×25 × 4 = ×100</span> (<a href="https://www.who.int/news-room/fact-sheets/detail/hiv-aids" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "underline" }}>WHO ↗</a>). If <span data-f>prevalence × environment × pool</span> exceeds 100%, the «chance the partner is infected» is capped at 100% — a rough assumption.</>),
    assumExTitle: "Example: how environment and pool combine",
    assumExFormula: (<>Chance a partner is already infected = <span data-f>prevalence × environment × pool</span>.</>),
    assumSources: (<>Sources: <a href="https://pubmed.ncbi.nlm.nih.gov/1411843/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>casual vs steady ↗</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5737755/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>once-off prevalence ↗</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5431278/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>assortative mixing ↗</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC6380304/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>NATSAL-3 ↗</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC2563886/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>condom by partnership (NATSAL, Britain) ↗</a> · <a href="https://www.who.int/news-room/fact-sheets/detail/sexually-transmitted-infections-(stis)" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>WHO ↗</a></>),
    footerDisclaimer: "This is an amateur educational model, not a medical forecast and not a basis for medical decisions.",
    footerNoWarranty: "Provided “as is”, for educational use only, without any warranty — use at your own risk.",
    githubLink: "Source code on GitHub ↗",
    yrAxis: "y",
    // ── Режим / Mode switcher ──
    modeSti: "🦠 STIs",
    modePreg: "🤰 Pregnancy",
    pregTitle: "Probability of pregnancy over time",
    pregIntro: "",
    pregWarnTitle: "This is an amateur calculator, not a medical tool.",
    pregWarnBody: "The model mixes rough approximations with reliable data. Don't use it for pregnancy planning, choosing contraception, or fertility problems — consult a specialist.",
    pregWoman: "👩 Woman / couple",
    pregMan: "👨 Man",
    pregWomanExpl: (<><b data-hi>The «Woman» model is equivalent to the «Couple» model.</b> You can get pregnant at most once per cycle. Partners <b>do not add up</b>: only the total amount of sex and contraception matter, not the number of partners.</>),
    pregManExpl: (<>We count «at least one pregnancy among partners»: here partners <b>do add up</b> (more partners/acts → higher chance of ≥1 event).</>),
    pregProfile: "Profile",
    pregWomanAge: "Woman's age",
    pregWomanAgeInfo: "The main fertility factor; a sharp drop after 35. Age values are a trend estimate (ASRM/Dunson/NICE).",
    pregFreqInfo: "Frequency matters through hitting the fertile window; a plateau ~every other day. The shape of the dependence is an estimate.",
    pregLineWoman: "Probability of pregnancy",
    pregLineNoContra: "no contraception",
    pregHeadWoman: (years, yw, pct, hasContra) => (<>Over {years} {yw} the chance of getting pregnant ≈ <b data-hi>{pct}</b>{hasContra ? " with the chosen contraception" : " without contraception"}.</>),
    pregBehaviorPreset: "Behavior preset",
    pregMyAge: "My age",
    pregMyAgeInfo: "A man's age weakly affects fertility (more noticeable after ~45). Here it's a rough estimate — so the effect is visible on the chart.",
    pregPartnerAge: "Partner's age",
    pregPartnerAgeInfo: "A woman's age is the main fertility factor. For the man it's an estimate (often not known precisely).",
    pregLineMan: "≥1 pregnancy from me",
    pregLineIfNoContra: "if without contraception",
    pregHeadMan: (years, yw, pct) => (<>Over {years} {yw} the chance that at least one partner gets pregnant ≈ <b data-hi>{pct}</b>.</>),
    pregOneoffCap: "one-off act",
    pregOngoingCap: "lasts the whole period",
    pregRelCap: (d) => `relationship ${d}`,
    pregNoPartnersF: "No partners — add some in the cards on the left.",
    // ── Контрацепция / WomanMethods ──
    contraLabel: "Contraception",
    contraInfo: "Add the methods you use — as many as you like and combine them. For «per-act» methods (condom etc.) the slider sets the share of acts. Details and sources — in the reference below.",
    addMethod: "+ add method",
    allMethodsAdded: "All methods added",
    sevTitle: "side-effect severity (estimate)",
    removeMethod: "remove method",
    shareOfActs: "share of acts using it",
    // ── Справочная таблица контрацепции ──
    contraTableTitle: "Contraception methods reference",
    contraTableSub: "",
    thMethod: "Method",
    thPerfect: "Perfect",
    thTypical: "Typical",
    pregPerYear: "% preg./yr",
    typicalInfo: "This is the share of women who got pregnant during the first year of use. «Perfect» — if the method is always used correctly; «Typical» — real-world use with misses and mistakes, as for most people.",
    thSideFx: "Side effects",
    howWorks: "How it works",
    sideRisks: "Side effects and risks",
    whoFor: "Who / contraindications",
    contraSourcesTail: "— for reference, not a prescription.",
    // ── Допущения (беременность) ──
    pregAssumTitle: "Assumptions and how this is computed",
    pregAssum1: (<><b data-hi>The unit is a cycle (≈month).</b> Cumulative <span data-f>P(t) = 1 − (1 − annual_failure)^years</span> — the same «survival» logic as in the STI mode.</>),
    pregAssum2: (<><b data-hi>Fertility depends on age.</b> A young couple ~20–25% per cycle, a sharp drop after 35. We use population-average values (ASRM, Dunson, NICE) — a trend estimate, not a personal probability; the individual spread is large.</>),
    pregAssum3: (<><b data-hi>Conception only.</b> The model estimates the chance of conception, not of a live birth: miscarriages, ectopic pregnancy and other outcomes are not counted.</>),
    pregAssum4: (<><b data-hi>Random day of the cycle.</b> If the fertile window isn't tracked, we assume acts happen on random days — base fertility is averaged over the whole cycle.</>),
    pregAssum5: (<><b data-hi>Contraception.</b> From the typical-use table (<a href="https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" target="_blank" rel="noopener noreferrer" style={{ color: "#a78bfa", textDecoration: "none" }}>CDC/Trussell ↗</a>). Several methods combine by multiplication (a lower bound).</>),
    pregAssum6: (<><b data-hi>Woman and man.</b> For the woman, partners don't add up — one conception per cycle. For the man we count «at least one pregnancy among partners»: more partners and unprotected sex → higher chance.</>),
    pregAssum7: (<><b data-hi>Man = STI logic.</b> «At least one pregnancy among partners»: the contribution of each type is multiplied. Steady — by cycles over the whole period; recurring — a relationship of duration dur, refreshed yearly; hookups — a single act (per-act ≈ ⅕ of the per-cycle f — a rough estimate).</>),
    pregAssum8: (<><b data-hi>Why the number of partners matters for the man.</b> Each partner is a separate «draw»: she can get pregnant independently of the others, so we count not «how many children total» but the chance that <b>at least one</b> pregnancy happens. The more partners — and the more unprotected sex with each — the higher that chance, because independent opportunities pile up. For each partner we take her «did not get pregnant» probability and multiply them together; one minus that product is «at least one». For the woman it is the opposite: partners do not add up, because her cycle is the shared bottleneck (one conception per cycle).</>),
    pregAssumSources: (<>Sources: <a href="https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>CDC / Trussell (contraception) ↗</a> · <a href="https://www.nice.org.uk/guidance/cg156" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>NICE (fertility &amp; age) ↗</a> · <a href="https://www.who.int/news-room/fact-sheets/detail/infertility" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>WHO (infertility) ↗</a></>),
  },
  ru: {
    langName: "Русский",
    title: "Риск ЗППП во времени",
    badge: "иллюстративная модель",
    intro: "",
    warnTitle: "Это любительский калькулятор, а не медицинский инструмент.",
    warnBody: (<>Реальные вероятности <b style={{ color: C.accent }}>практически гарантированно не точные</b>, так как использовано много допущений и оценок с большими разбросами. Основная польза модели — сравнение того, как разные параметры могут влиять на вероятность заражения. Не принимайте медицинских решений на основе модели — консультируйтесь со специалистом.</>),
    preset: "Пресет поведения",
    presetInfo: (<><b>Целибат</b> — без секса.<br /><b>Моногамия</b> — один постоянный партнёр.<br /><b>Серийная моногамия</b> — один партнёр, но со временем они меняются.<br /><b>Monogamish</b> — в основном один + редкие хукапы.<br /><b>Открытые / свинг</b> — постоянный партнёр плюс секс на стороне.<br /><b>Полиамория</b> — несколько постоянных связей одновременно.<br /><b>ONS / хукапы</b> — секс на одну ночь, без продолжения.<br /><b>Core group</b> — тесный круг с частой сменой партнёров.</>),
    sexActs: "Виды секса",
    sexActsInfo: "Какие практики и в какой роли. Риск за акт зависит от практики: рецептивный анальный ≈ ×17 к вагинальному, вводящий — меньше, оральный — заметно ниже (по данным ВИЧ; для других инфекций грубо). Для упрощения считаем, что в каждом контакте присутствуют все выбранные практики — поэтому каждая добавленная только повышает риск.",
    noActs: "Не выбрано ни одной практики — риск считается нулевым.",
    protection: "Защита и иммунитет",
    vaxHpv: "Привит от ВПЧ",
    vaxHbv: "Привит от гепатита B",
    vaccinated: "привит",
    addBtn: "+ добавить",
    removeCard: "убрать (количество → 0)",
    shareBtn: "Поделиться профилем риска",
    shareDone: "Скопировано в буфер!",
    shareHint: "Скопировать ссылку, открывающую именно эти настройки",
    poolInfo: (<>Насколько «активен» круг партнёров этого типа. Хукапы — из более активного круга → чаще заражены.</>),
    bg: "круг", bgMul: (m) => `круг ×${m}`,
    oneActBg: (m) => `1 акт · круг ×${m}`,
    condom: "Презерватив",
    condomInfo: "Доля актов с партнёрами этого типа, в которых используется презерватив.",
    tested: "Проверены",
    testedInfo: "Доля партнёров этого типа, чей недавний отрицательный тест ты ЗНАЕШЬ — снизить риск может только известный результат.",
    details: "детали",
    sexPerWeek: "Секс в неделю",
    sexPerWeekHint: "как часто секс с одним таким партнёром",
    relDuration: "Длительность связи",
    relDurationHint: "как долго длится одна такая связь",
    oneoffNote: "Разовый контакт — один акт на партнёра.",
    ongoingNote: "Длится весь период — экспозиция копится со временем.",
    horizon: "Период активной половой жизни",
    horizonHint: "",
    scale: "Масштаб шкалы вероятности",
    scaleHint: "",
    atLeastOne: "хотя бы одна из включённых",
    envLabel: "Среда",
    envNormal: "обычная", envHigh: "высокий фон", envOutbreak: "вспышка",
    envInfo: (<>Инфекции концентрируются в сексуальных сетях, поэтому партнёр заражён чаще, чем по средней распространённости. Переключатель множит распространённость каждой инфекции — свой множитель, см. карточку болезни.<br /><br /><b>Высокий фон</b> — более активный, рисковый круг.<br /><b>Вспышка</b> — концентрированная сеть во время активной эпидемии.<br /><br />Иллюстративные оценки, не прогноз.</>),
    envGuideLabel: "Среда риска (множитель к распространённости)",
    anyLabel: "Хотя бы одна",
    topRiskLine: (years, yw, name, pct, col) => (<>За {years} {yw} активной половой жизни выше всего риск <span style={{ color: col, fontWeight: 600 }}>{name}</span> — около <span style={{ color: C.hi, fontWeight: 600 }}>{pct}</span>.</>),
    enableOne: "Включи хотя бы одну инфекцию ниже.",
    structTitle: "Структура партнёрств во времени",
    structStats: (avg, lanes, total) => (<>секс ≈ <b data-hi>{avg}×</b>/нед · пик <b data-hi>{lanes}</b> · всего связей: <b data-hi>{total}</b></>),
    legSteady: "постоянные", legCasual: "приходящие", legHookup: "хукапы",
    structLegendTail: "",
    noPartners: "Нет партнёров — добавь в карточках слева.",
    shownPart: (total) => `показана часть связей для наглядности — статистика по всем ${total}`,
    perWk: "/нед",
    thInfection: "Инфекция",
    thRisk: (years, yw) => `Риск за ${years} ${yw}`,
    thPerAct: "За контакт: без → с презервативом",
    thTreatment: "Лечение",
    thConsequences: "Последствия",
    thSource: "Источник",
    accuracyLab: "Точность",
    acc: { "high": "высокая", "low-mid": "низкая–средняя", "low": "низкая" },
    sourcesLab: "Источники",
    guideTail: "",
    sympt: "Симптомы", treatm: "Лечение", conseq: "Последствия",
    collapseGuide: "свернуть гайд", openGuide: "открыть гайд по болезни",
    breakdownTitle: "Разбор расчёта — откуда берётся цифра",
    breakdownIntro: "",
    condomBlockTitle: "Что даёт презерватив (если использовать в каждом контакте со всеми)",
    withoutCondom: "без презерватива", withCondom: "с презервативом",
    barAct: "За 1 контакт (все практики, если партнёр заражён)",
    barHor: (years, yw) => `За ${years} ${yw}`,
    satDrop: (years, yw, cutAct, cutHor) => (<>За <b data-hi>один контакт</b> презерватив убирает <b data-grn>{cutAct}%</b> риска. Но за <b data-hi>{years} {yw}</b> с повторами — уже только <b data-red>{cutHor}%</b>: при многих контактах риск «насыщается», и относительная защита падает.</>),
    satFlat: (years, yw, cutHor) => (<>И за <b data-hi>один контакт</b>, и за <b data-hi>{years} {yw}</b> презерватив убирает примерно одинаково (~<b data-grn>{cutHor}%</b>). У редко передающихся инфекций риск не «насыщается», поэтому относительная защита со временем не падает.</>),
    contribIntro: (years, yw) => (<>Вклад каждого <b data-hi>типа партнёров</b> за {years} {yw} (своя частота, длительность, презерватив, проверенность, фон), затем они объединяются:</>),
    thType: "Тип", thPartners: "Партнёров", thContacts: "Контактов k", thTransPerAct: "Передача за контакт", thChanceInf: "Шанс партнёр заразен", thRiskHor: (years, yw) => `Риск за ${years} ${yw}`,
    perYear: "/год",
    noActivePartners: "Нет активных партнёров — добавь кого-нибудь в карточках слева, чтобы увидеть разбор.",
    thContactsInfo: (<><b data-hi>Половых актов с одним партнёром</b> этого типа за период.<br />Формула: <span data-f>секс/нед × 52/12 × длительность (мес)</span>; хукап = 1 акт.</>),
    thTransPerActInfo: (<><b data-hi>Передача за один контакт</b>, если партнёр заражён.<br />Складывает выбранные виды секса; уже учитывает презерватив и прививку этого типа.<br />Формула: <span data-f>1 − ∏(1 − β·практика·(1 − презерватив·e))</span> по выбранным практикам.</>),
    thChanceInfInfo: (<><b data-hi>Шанс, что партнёр уже заражён.</b><br />Формула: <span data-f>распространённость × среда × пул × (1 − проверенность)</span>.</>),
    thRiskHorInfo: (<><b data-hi>Риск от этого типа за период.</b><br />От одного партнёра: <span data-f>1 − (1 − шанс_заражён × передача_за_все_контакты)</span>, возводится в степень числа партнёров.<br />Затем типы объединяются в строке «Всего» ниже.</>),
    thTotal: "Всего",
    thTotalInfo: (<><b data-hi>Итоговый риск — высота кривой.</b><br />Типы независимы, поэтому объединяются: <span data-f>всего = 1 − произведение «не заразиться» по всем типам</span>.</>),
    assumTitle: "Допущения и как это считается",
    assumP1: (<>Только для <b data-hi>ВИЧ</b> передача за акт и эффективность презерватива взяты из исследований (сплошная линия). Для остальных инфекций надёжных чисел нет — это правдоподобные оценки по порядку величины (пунктир) на основе данных CDC и ВОЗ; источник по каждой инфекции — в колонке «Источник» таблицы.</>),
    assumP2: (<><b data-hi>Типы партнёров.</b> Поведение задаётся тремя типами — постоянные, приходящие, хукапы. У каждого можно отдельно настроить, как часто используется презерватив и насколько ты знаешь о справках партнёров. У каждого типа также свой множитель вероятности, что партнёр уже заражён — разные партнёры существуют в кругах разной активности: постоянные ×1, приходящие ×2, хукапы ×4. Оценка по опросам: у случайных и разовых партнёров распространённость в разы выше, чем у постоянных (≈×3–7; <a href="https://pubmed.ncbi.nlm.nih.gov/1411843/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "underline" }}>казуальные vs постоянные ↗</a>, <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5737755/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "underline" }}>распространённость у разовых ↗</a>). Множитель относительный — общий уровень сообщества задаёт «Среда», и они перемножаются, не дублируя друг друга.</>),
    assumP3: (<><b data-hi>Виды секса складываются.</b> Считаем, что в каждом контакте присутствуют все выбранные практики, поэтому каждая добавленная только повышает риск (упрощение — в реальности не всегда так). Соотношения рисков опираются на ВИЧ; для остальных инфекций это грубое приближение.</>),
    assumP4: (<><b data-hi>Проверенность.</b> У теста есть «окно» между заражением и положительным результатом, поэтому даже 100% проверенных не гарантируют ноль — это оценка.</>),
    assumP5: (<><b data-hi>Пул партнёров.</b> Оценивает, насколько активнее круг этого типа и потому вероятнее уже заражён партнёр. Относительные множители (постоянные &lt; приходящие &lt; хукапы), не точные величины.</>),
    assumP6: (<><b data-hi>Как считается.</b> Для типа число контактов <span data-f>k = частота × длительность</span> (хукап = 1). Шанс заразиться от партнёра растёт с k и умножается на шанс, что партнёр заражён. Вклады всех типов перемножаются → кумулятивный риск растёт во времени. Точные формулы по столбцам — в подсказках таблицы разбора.</>),
    assumPEnv: (<><b data-hi>Среда.</b> Множитель типа партнёра отражает круг конкретного партнёра, а «Среда» сдвигает фон всего сообщества: обычная / высокий фон / вспышка — свой множитель к распространённости каждой инфекции (значения и источники — в карточках болезней). Тип выбирает круг партнёра, среда задаёт общий уровень; вместе они дают «шанс, что партнёр заражён» = <span data-f>распространённость × среда × пул</span>, без двойного счёта. Пример (ВИЧ): во вспышку распространённость в «кор-группе» примерно в 100 раз выше средней, но часть этого уже несёт множитель типа партнёра (хукап ×4), поэтому для среды берём ×25 — вместе <span data-f>×25 × 4 = ×100</span> (<a href="https://www.who.int/news-room/fact-sheets/detail/hiv-aids" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "underline" }}>ВОЗ ↗</a>). Если произведение <span data-f>распространённость × среда × пул</span> выходит за 100%, «шанс, что партнёр заражён» ограничивается 100% — это грубое допущение.</>),
    assumExTitle: "Пример: как комбинируются среда и пул",
    assumExFormula: (<>Шанс, что партнёр уже заражён = <span data-f>распространённость × среда × пул</span>.</>),
    assumSources: (<>Источники: <a href="https://pubmed.ncbi.nlm.nih.gov/1411843/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>казуальные vs постоянные ↗</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5737755/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>распространённость у разовых ↗</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5431278/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>ассортативное смешивание ↗</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC6380304/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>NATSAL-3 ↗</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC2563886/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>презерватив по типу связи (NATSAL, Британия) ↗</a> · <a href="https://www.who.int/news-room/fact-sheets/detail/sexually-transmitted-infections-(stis)" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>ВОЗ ↗</a></>),
    footerDisclaimer: "Это любительская образовательная модель, а не медицинский прогноз и не основание для медицинских решений.",
    footerNoWarranty: "Предоставляется «как есть», только в образовательных целях, без каких-либо гарантий — на свой риск.",
    githubLink: "Исходный код на GitHub ↗",
    yrAxis: "г",
    modeSti: "🦠 ЗППП",
    modePreg: "🤰 Беременность",
    pregTitle: "Вероятность беременности во времени",
    pregIntro: "",
    pregWarnTitle: "Это любительский калькулятор, а не медицинский инструмент.",
    pregWarnBody: "Модель использует грубые приближения вперемешку с надёжными данными. Не используйте её для планирования беременности, выбора контрацепции или при проблемах с зачатием — обратитесь к специалисту.",
    pregWoman: "👩 Девушка / пара",
    pregMan: "👨 Парень",
    pregWomanExpl: (<><b data-hi>Модель «Девушка» эквивалентна модели «Пара».</b> Забеременеть можно максимум раз за цикл. Партнёры <b>не суммируются</b>: важно только суммарное количество секса и контрацепция, а не число партнёров.</>),
    pregManExpl: (<>Считаем «хотя бы одна беременность среди партнёрш»: здесь партнёрши <b>суммируются</b> (больше партнёрш/актов → выше шанс ≥1 события).</>),
    pregProfile: "Профиль",
    pregWomanAge: "Возраст женщины",
    pregWomanAgeInfo: "Главный фактор фертильности; резкий спад после 35. Значения по возрасту — оценка тренда (ASRM/Dunson/NICE).",
    pregFreqInfo: "Частота влияет через попадание в фертильное окно; плато ~через день. Форма зависимости — оценка.",
    pregLineWoman: "Вероятность беременности",
    pregLineNoContra: "без контрацепции",
    pregHeadWoman: (years, yw, pct, hasContra) => (<>За {years} {yw} вероятность забеременеть ≈ <b data-hi>{pct}</b>{hasContra ? " с выбранной контрацепцией" : " без контрацепции"}.</>),
    pregBehaviorPreset: "Пресет поведения",
    pregMyAge: "Мой возраст",
    pregMyAgeInfo: "Возраст мужчины слабо влияет на фертильность (заметнее после ~45). Здесь грубая оценка — чтобы эффект было видно на графике.",
    pregPartnerAge: "Возраст партнёрши",
    pregPartnerAgeInfo: "Возраст женщины — главный фактор фертильности. Для парня это оценка (часто неизвестен точно).",
    pregLineMan: "≥1 беременность от меня",
    pregLineIfNoContra: "если без контрацепции",
    pregHeadMan: (years, yw, pct) => (<>За {years} {yw} вероятность, что хотя бы одна партнёрша забеременеет ≈ <b data-hi>{pct}</b>.</>),
    pregOneoffCap: "разовый акт",
    pregOngoingCap: "длится весь период",
    pregRelCap: (d) => `связь ${d}`,
    pregNoPartnersF: "Нет партнёрш — добавь в карточках слева.",
    contraLabel: "Контрацепция",
    contraInfo: "Добавляй методы, которыми пользуешься — можно сколько угодно и сочетать. У методов «на каждый акт» (презерватив и т.п.) ползунок задаёт долю актов. Подробности и источники — в справке ниже.",
    addMethod: "+ добавить метод",
    allMethodsAdded: "Все методы добавлены",
    sevTitle: "серьёзность побочек (оценка)",
    removeMethod: "убрать метод",
    shareOfActs: "доля актов с использованием",
    contraTableTitle: "Справка по методам контрацепции",
    contraTableSub: "",
    thMethod: "Метод",
    thPerfect: "Идеальное",
    thTypical: "Реальное",
    pregPerYear: "% берем./год",
    typicalInfo: "Это доля женщин, забеременевших за первый год использования метода. «Идеальное» — если применять метод всегда и правильно; «Реальное» — реальное использование с пропусками и ошибками, как у большинства.",
    thSideFx: "Побочки",
    howWorks: "Как работает",
    sideRisks: "Побочки и риски",
    whoFor: "Кому / противопоказания",
    contraSourcesTail: "— справочно, не назначение.",
    pregAssumTitle: "Допущения и как это считается",
    pregAssum1: (<><b data-hi>Единица — цикл (≈месяц).</b> Кумулятив <span data-f>P(t) = 1 − (1 − годовой_отказ)^лет</span> — та же «выживаемостная» логика, что в режиме ЗППП.</>),
    pregAssum2: (<><b data-hi>Фертильность зависит от возраста.</b> Молодая пара ~20–25% за цикл, резкий спад после 35. Берём усреднённые популяционные значения (ASRM, Dunson, NICE) — это оценка тренда, не личная вероятность; индивидуальный разброс большой.</>),
    pregAssum3: (<><b data-hi>Только зачатие.</b> Модель оценивает вероятность зачатия, а не рождения ребёнка: выкидыши, внематочную беременность и прочие исходы не учитывает.</>),
    pregAssum4: (<><b data-hi>Случайный день цикла.</b> Если фертильное окно не отслеживается, считаем, что акты происходят в случайные дни — базовая фертильность усреднена по всему циклу.</>),
    pregAssum5: (<><b data-hi>Контрацепция.</b> Берётся таблица типичного использования (<a href="https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" target="_blank" rel="noopener noreferrer" style={{ color: "#a78bfa", textDecoration: "none" }}>CDC/Trussell ↗</a>). Несколько методов сочетаются перемножением (оценка снизу).</>),
    pregAssum6: (<><b data-hi>Девушка и парень.</b> У девушки партнёры не суммируются — одно зачатие за цикл. У парня считаем «хотя бы одну беременность среди партнёрш»: больше партнёрш и секса без контрацепции → выше шанс.</>),
    pregAssum7: (<><b data-hi>Парень = ЗППП-логика.</b> «Хотя бы одна беременность среди партнёрш»: вклад каждого типа перемножается. Постоянные — по циклам весь период; приходящие — связь длительностью dur, обновляется за год; хукапы — один акт (per-act ≈ ⅕ от цикловой f — грубая оценка).</>),
    pregAssum8: (<><b data-hi>Почему у парня важно число партнёрш.</b> Каждая партнёрша — отдельный «розыгрыш»: забеременеть она может независимо от других, поэтому считаем не «сколько всего детей», а шанс, что произойдёт <b>хотя бы одна</b> беременность. Чем больше партнёрш и чем больше с каждой секса без надёжной контрацепции — тем выше этот шанс, потому что независимые возможности складываются. Для каждой партнёрши берём вероятность «не забеременела» и перемножаем их; единица минус это произведение и есть «хотя бы одна». У девушки наоборот: партнёры не складываются, потому что её цикл — общее узкое место (одно зачатие за цикл).</>),
    pregAssumSources: (<>Источники: <a href="https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>CDC / Trussell (контрацепция) ↗</a> · <a href="https://www.nice.org.uk/guidance/cg156" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>NICE (фертильность и возраст) ↗</a> · <a href="https://www.who.int/news-room/fact-sheets/detail/infertility" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>ВОЗ (бесплодие) ↗</a></>),
  },
  sr: {
    langName: "Srpski",
    title: "Rizik od PPI tokom vremena",
    badge: "ilustrativni model",
    intro: "",
    warnTitle: "Ovo je amaterski kalkulator, a ne medicinski alat.",
    warnBody: (<>Stvarne verovatnoće su <b style={{ color: C.accent }}>gotovo sigurno netačne</b>, jer model koristi mnogo pretpostavki i procena sa velikim rasponima. Glavna korist je poređenje kako različiti parametri mogu uticati na verovatnoću zaraze. Ne donosi medicinske odluke na osnovu modela — posavetuj se sa stručnjakom.</>),
    preset: "Preset ponašanja",
    presetInfo: (<><b>Celibat</b> — bez seksa.<br /><b>Monogamija</b> — jedan stalni partner.<br /><b>Serijska monogamija</b> — jedan partner, ali se vremenom menjaju.<br /><b>Monogamish</b> — uglavnom jedan + retke avanture.<br /><b>Otvorene / sving</b> — stalni partner plus seks sa strane.<br /><b>Poliamorija</b> — nekoliko stalnih veza istovremeno.<br /><b>ONS / avanture</b> — seks za jednu noć, bez nastavka.<br /><b>Core group</b> — uzak krug sa čestom izmenom partnera.</>),
    sexActs: "Vrste seksa",
    sexActsInfo: "Koje prakse i u kojoj ulozi. Rizik po aktu zavisi od prakse: receptivni analni ≈ ×17 u odnosu na vaginalni, insertivni manje, oralni znatno niže (po podacima o HIV-u; grubo za ostale infekcije). Radi jednostavnosti smatramo da su u svakom kontaktu prisutne sve izabrane prakse — pa svaka dodata samo povećava rizik.",
    noActs: "Nijedna praksa nije izabrana — rizik se računa kao nula.",
    protection: "Zaštita i imunitet",
    vaxHpv: "Vakcinisan/a protiv HPV-a",
    vaxHbv: "Vakcinisan/a protiv hepatitisa B",
    vaccinated: "vakcinisan/a",
    addBtn: "+ dodaj",
    removeCard: "ukloni (broj → 0)",
    shareBtn: "Podeli profil rizika",
    shareDone: "Kopirano u klipbord!",
    shareHint: "Kopiraj link koji otvara baš ova podešavanja",
    poolInfo: (<>Koliko je „aktivan“ krug ovog tipa partnera. Avanture — iz aktivnijeg kruga → češće zaražene.</>),
    bg: "krug", bgMul: (m) => `krug ×${m}`,
    oneActBg: (m) => `1 akt · krug ×${m}`,
    condom: "Kondom",
    condomInfo: "Udeo akata sa partnerima ovog tipa u kojima se koristi kondom.",
    tested: "Testirani",
    testedInfo: "Udeo partnera ovog tipa čiji nedavni negativan test ZNAŠ — rizik smanjuje samo poznat rezultat.",
    details: "detalji",
    sexPerWeek: "Seks nedeljno",
    sexPerWeekHint: "koliko često ima seksa sa jednim takvim partnerom",
    relDuration: "Trajanje veze",
    relDurationHint: "koliko dugo traje jedna takva veza",
    oneoffNote: "Jednokratni kontakt — jedan akt po partneru.",
    ongoingNote: "Traje ceo period — izloženost se gomila tokom vremena.",
    horizon: "Period aktivnog polnog života",
    horizonHint: "",
    scale: "Razmera skale verovatnoće",
    scaleHint: "",
    atLeastOne: "bar jedna od uključenih",
    envLabel: "Sredina",
    envNormal: "obična", envHigh: "visok fon", envOutbreak: "epidemija",
    envInfo: (<>Infekcije se koncentrišu u seksualnim mrežama, pa je partner zaražen češće nego po prosečnoj rasprostranjenosti. Prekidač množi rasprostranjenost svake infekcije — sopstveni množilac, vidi karticu bolesti.<br /><br /><b>Visok fon</b> — aktivniji, rizičniji krug.<br /><b>Epidemija</b> — koncentrisana mreža tokom aktivne epidemije.<br /><br />Ilustrativne procene, ne predviđanje.</>),
    envGuideLabel: "Rizik sredine (množilac rasprostranjenosti)",
    anyLabel: "Bar jedna",
    topRiskLine: (years, yw, name, pct, col) => (<>Tokom {years} {yw} aktivnog polnog života najviši rizik je <span style={{ color: col, fontWeight: 600 }}>{name}</span> — oko <span style={{ color: C.hi, fontWeight: 600 }}>{pct}</span>.</>),
    enableOne: "Uključi bar jednu infekciju ispod.",
    structTitle: "Struktura partnerstava tokom vremena",
    structStats: (avg, lanes, total) => (<>seks ≈ <b data-hi>{avg}×</b>/ned · vrh <b data-hi>{lanes}</b> · ukupno veza: <b data-hi>{total}</b></>),
    legSteady: "stalni", legCasual: "povremeni", legHookup: "avanture",
    structLegendTail: "",
    noPartners: "Nema partnera — dodaj u karticama levo.",
    shownPart: (total) => `prikazan deo veza radi preglednosti — statistika po svih ${total}`,
    perWk: "/ned",
    thInfection: "Infekcija",
    thRisk: (years, yw) => `Rizik za ${years} ${yw}`,
    thPerAct: "Po aktu: bez → sa kondomom",
    thTreatment: "Lečenje",
    thConsequences: "Posledice",
    thSource: "Izvor",
    accuracyLab: "Tačnost",
    acc: { "high": "visoka", "low-mid": "niska–srednja", "low": "niska" },
    sourcesLab: "Izvori",
    guideTail: "",
    sympt: "Simptomi", treatm: "Lečenje", conseq: "Posledice",
    collapseGuide: "skupi vodič", openGuide: "otvori vodič o bolesti",
    breakdownTitle: "Razrada računa — odakle dolazi broj",
    breakdownIntro: "",
    condomBlockTitle: "Šta daje kondom (ako se koristi u svakom kontaktu sa svima)",
    withoutCondom: "bez kondoma", withCondom: "sa kondomom",
    barAct: "Po 1 kontaktu (sve prakse, ako je partner zaražen)",
    barHor: (years, yw) => `Za ${years} ${yw}`,
    satDrop: (years, yw, cutAct, cutHor) => (<>Po <b data-hi>jednom kontaktu</b> kondom uklanja <b data-grn>{cutAct}%</b> rizika. Ali za <b data-hi>{years} {yw}</b> sa ponavljanjima — već samo <b data-red>{cutHor}%</b>: pri mnogo kontakata rizik se „zasiti“, i relativna zaštita opada.</>),
    satFlat: (years, yw, cutHor) => (<>I po <b data-hi>jednom kontaktu</b> i za <b data-hi>{years} {yw}</b> kondom uklanja otprilike isto (~<b data-grn>{cutHor}%</b>). Kod retko prenosivih infekcija rizik se ne „zasiti“, pa relativna zaštita tokom vremena ne opada.</>),
    contribIntro: (years, yw) => (<>Doprinos svakog <b data-hi>tipa partnera</b> za {years} {yw} (sopstvena učestalost, trajanje, kondom, udeo testiranih, pozadina), zatim se kombinuju:</>),
    thType: "Tip", thPartners: "Partnera", thContacts: "Kontakata k", thTransPerAct: "Prenos po kontaktu", thChanceInf: "Šansa da je partner zaražen", thRiskHor: (years, yw) => `Rizik za ${years} ${yw}`,
    perYear: "/god",
    noActivePartners: "Nema aktivnih partnera — dodaj nekoga u karticama levo da bi video/la razradu.",
    thContactsInfo: (<><b data-hi>Polnih akata sa jednim partnerom</b> ovog tipa tokom perioda.<br />Formula: <span data-f>seks/ned × 52/12 × trajanje (mes)</span>; avantura = 1 akt.</>),
    thTransPerActInfo: (<><b data-hi>Prenos u jednom kontaktu</b>, ako je partner zaražen.<br />Sabira izabrane vrste seksa; već uračunava kondom i vakcinu ovog tipa.<br />Formula: <span data-f>1 − ∏(1 − β·praksa·(1 − kondom·e))</span> po izabranim praksama.</>),
    thChanceInfInfo: (<><b data-hi>Šansa da je partner već zaražen.</b><br />Formula: <span data-f>rasprostranjenost × sredina × pul × (1 − testirani)</span>.</>),
    thRiskHorInfo: (<><b data-hi>Rizik od ovog tipa tokom perioda.</b><br />Od jednog partnera: <span data-f>1 − (1 − šansa_zaražen × prenos_po_svim_kontaktima)</span>, stepenuje se brojem partnera.<br />Zatim se tipovi objedinjuju u redu „Ukupno“ ispod.</>),
    thTotal: "Ukupno",
    thTotalInfo: (<><b data-hi>Konačni rizik — visina krive.</b><br />Tipovi su nezavisni, pa se objedinjuju: <span data-f>ukupno = 1 − proizvod „ne zaraziti se“ po svim tipovima</span>.</>),
    assumTitle: "Pretpostavke i kako se ovo računa",
    assumP1: (<>Samo za <b data-hi>HIV</b> su prenos po aktu i efikasnost kondoma uzeti iz istraživanja (puna linija). Za ostale infekcije nema pouzdanih brojeva — to su procene reda veličine (isprekidana) na osnovu CDC i SZO; izvor za svaku infekciju je u koloni „Izvor“ tabele.</>),
    assumP2: (<><b data-hi>Tipovi partnera.</b> Ponašanje se zadaje sa tri tipa — stalni, povremeni, avanture. Za svaki posebno možeš podesiti koliko se često koristi kondom i koliko znaš o testovima partnera. Svaki tip ima i svoj množilac verovatnoće da je partner već zaražen — različiti partneri dolaze iz krugova različite aktivnosti: stalni ×1, povremeni ×2, avanture ×4. Procena iz anketa: kod povremenih i jednokratnih partnera prevalencija je višestruko viša nego kod stalnih (≈×3–7; <a href="https://pubmed.ncbi.nlm.nih.gov/1411843/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "underline" }}>povremeni vs stalni ↗</a>, <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5737755/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "underline" }}>prevalencija kod jednokratnih ↗</a>). Množilac je relativan — opšti nivo zajednice zadaje „Sredina“, i oni se množe bez dvostrukog brojanja.</>),
    assumP3: (<><b data-hi>Vrste seksa se sabiraju.</b> Smatramo da je u svakom kontaktu prisutna svaka izabrana praksa, pa dodavanje samo povećava rizik (pojednostavljenje — u stvarnosti nije uvek tako). Odnosi rizika oslanjaju se na HIV; za ostale infekcije to je gruba aproksimacija.</>),
    assumP4: (<><b data-hi>Udeo testiranih.</b> Test ima „prozor“ između zaraze i pozitivnog rezultata, pa čak ni 100% testiranih ne garantuje nulu — to je procena.</>),
    assumP5: (<><b data-hi>Pul partnera.</b> Procenjuje koliko je aktivniji krug ovog tipa i zato verovatnije da je partner već zaražen. Relativni množioci (stalni &lt; povremeni &lt; avanture), ne tačne vrednosti.</>),
    assumP6: (<><b data-hi>Kako se računa.</b> Po tipu broj kontakata je <span data-f>k = učestalost × trajanje</span> (avantura = 1). Šansa za zarazu od partnera raste sa k i množi se šansom da je partner zaražen. Doprinosi svih tipova se množe → kumulativni rizik raste tokom vremena. Tačne formule po kolonama su u podsetnicima tabele razrade.</>),
    assumPEnv: (<><b data-hi>Sredina.</b> Množilac tipa partnera odražava krug konkretnog partnera, a „Sredina“ pomera osnovu cele zajednice: obična / visok fon / epidemija — sopstveni množilac na rasprostranjenost svake infekcije (vrednosti i izvori na karticama bolesti). Tip bira krug partnera, sredina zadaje opšti nivo; zajedno daju „šansu da je partner zaražen“ = <span data-f>rasprostranjenost × sredina × pul</span>, bez dvostrukog brojanja. Primer (HIV): u epidemiji je prevalencija u „core-grupi“ otprilike 100× viša od proseka, ali deo toga već nosi množilac tipa partnera (avantura ×4), pa za sredinu uzimamo ×25 — zajedno <span data-f>×25 × 4 = ×100</span> (<a href="https://www.who.int/news-room/fact-sheets/detail/hiv-aids" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "underline" }}>SZO ↗</a>). Ako <span data-f>rasprostranjenost × sredina × pul</span> pređe 100%, „šansa da je partner zaražen“ se ograničava na 100% — gruba pretpostavka.</>),
    assumExTitle: "Primer: kako se kombinuju sredina i pul",
    assumExFormula: (<>Šansa da je partner već zaražen = <span data-f>prevalencija × sredina × pul</span>.</>),
    assumSources: (<>Izvori: <a href="https://pubmed.ncbi.nlm.nih.gov/1411843/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>povremeni vs stalni ↗</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5737755/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>prevalencija kod jednokratnih ↗</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5431278/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>asortativno mešanje ↗</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC6380304/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>NATSAL-3 ↗</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC2563886/" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>kondom po tipu veze (NATSAL, Britanija) ↗</a> · <a href="https://www.who.int/news-room/fact-sheets/detail/sexually-transmitted-infections-(stis)" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>SZO ↗</a></>),
    footerDisclaimer: "Ovo je amaterski edukativni model, a ne medicinska prognoza ni osnov za medicinske odluke.",
    footerNoWarranty: "Pruža se „kao takvo“, samo u edukativne svrhe, bez ikakvih garancija — na sopstveni rizik.",
    githubLink: "Izvorni kod na GitHub-u ↗",
    yrAxis: "g",
    modeSti: "🦠 PPI",
    modePreg: "🤰 Trudnoća",
    pregTitle: "Verovatnoća trudnoće tokom vremena",
    pregIntro: "",
    pregWarnTitle: "Ovo je amaterski kalkulator, a ne medicinski alat.",
    pregWarnBody: "Model meša grube aproksimacije sa pouzdanim podacima. Ne koristi ga za planiranje trudnoće, izbor kontracepcije ili kod problema sa začećem — obrati se stručnjaku.",
    pregWoman: "👩 Devojka / par",
    pregMan: "👨 Mladić",
    pregWomanExpl: (<><b data-hi>Model „Devojka“ je ekvivalentan modelu „Par“.</b> Trudnoća je moguća najviše jednom po ciklusu. Partneri se <b>ne sabiraju</b>: bitna je samo ukupna količina seksa i kontracepcija, a ne broj partnera.</>),
    pregManExpl: (<>Računamo „bar jednu trudnoću među partnerkama“: ovde se partnerke <b>sabiraju</b> (više partnerki/akata → veća šansa za ≥1 događaj).</>),
    pregProfile: "Profil",
    pregWomanAge: "Starost žene",
    pregWomanAgeInfo: "Glavni faktor plodnosti; nagli pad posle 35. Vrednosti po starosti su procena trenda (ASRM/Dunson/NICE).",
    pregFreqInfo: "Učestalost utiče preko pogađanja plodnog prozora; plato ~svaki drugi dan. Oblik zavisnosti je procena.",
    pregLineWoman: "Verovatnoća trudnoće",
    pregLineNoContra: "bez kontracepcije",
    pregHeadWoman: (years, yw, pct, hasContra) => (<>Za {years} {yw} verovatnoća da se zatrudni ≈ <b data-hi>{pct}</b>{hasContra ? " sa izabranom kontracepcijom" : " bez kontracepcije"}.</>),
    pregBehaviorPreset: "Preset ponašanja",
    pregMyAge: "Moja starost",
    pregMyAgeInfo: "Starost muškarca slabo utiče na plodnost (uočljivije posle ~45). Ovde je gruba procena — da bi efekat bio vidljiv na grafikonu.",
    pregPartnerAge: "Starost partnerke",
    pregPartnerAgeInfo: "Starost žene je glavni faktor plodnosti. Za mladića je to procena (često nije tačno poznata).",
    pregLineMan: "≥1 trudnoća od mene",
    pregLineIfNoContra: "ako bez kontracepcije",
    pregHeadMan: (years, yw, pct) => (<>Za {years} {yw} verovatnoća da bar jedna partnerka zatrudni ≈ <b data-hi>{pct}</b>.</>),
    pregOneoffCap: "jednokratni akt",
    pregOngoingCap: "traje ceo period",
    pregRelCap: (d) => `veza ${d}`,
    pregNoPartnersF: "Nema partnerki — dodaj u karticama levo.",
    contraLabel: "Kontracepcija",
    contraInfo: "Dodaj metode koje koristiš — koliko god želiš i kombinuj ih. Kod metoda „po aktu“ (kondom itd.) klizač zadaje udeo akata. Detalji i izvori — u referenci ispod.",
    addMethod: "+ dodaj metod",
    allMethodsAdded: "Svi metodi su dodati",
    sevTitle: "ozbiljnost neželjenih efekata (procena)",
    removeMethod: "ukloni metod",
    shareOfActs: "udeo akata sa korišćenjem",
    contraTableTitle: "Referenca metoda kontracepcije",
    contraTableSub: "",
    thMethod: "Metod",
    thPerfect: "Idealno",
    thTypical: "Stvarno",
    pregPerYear: "% trud./god.",
    typicalInfo: "Ovo je udeo žena koje su zatrudnele tokom prve godine korišćenja metoda. „Idealno“ — ako se metod uvek koristi pravilno; „Stvarno“ — stvarno korišćenje sa propustima i greškama, kao kod većine.",
    thSideFx: "Neželjeni efekti",
    howWorks: "Kako radi",
    sideRisks: "Neželjeni efekti i rizici",
    whoFor: "Za koga / kontraindikacije",
    contraSourcesTail: "— informativno, ne propisivanje.",
    pregAssumTitle: "Pretpostavke i kako se ovo računa",
    pregAssum1: (<><b data-hi>Jedinica je ciklus (≈mesec).</b> Kumulativ <span data-f>P(t) = 1 − (1 − godišnji_neuspeh)^godina</span> — ista „logika preživljavanja“ kao u PPI režimu.</>),
    pregAssum2: (<><b data-hi>Plodnost zavisi od starosti.</b> Mlad par ~20–25% po ciklusu, nagli pad posle 35. Uzimamo prosečne populacione vrednosti (ASRM, Dunson, NICE) — procena trenda, ne lična verovatnoća; individualni raspon je velik.</>),
    pregAssum3: (<><b data-hi>Samo začeće.</b> Model procenjuje verovatnoću začeća, a ne rođenja deteta: pobačaji, vanmaterična trudnoća i drugi ishodi se ne računaju.</>),
    pregAssum4: (<><b data-hi>Slučajan dan ciklusa.</b> Ako se plodni prozor ne prati, smatramo da se akti dešavaju slučajnih dana — osnovna plodnost je usrednjena po celom ciklusu.</>),
    pregAssum5: (<><b data-hi>Kontracepcija.</b> Iz tabele tipičnog korišćenja (<a href="https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" target="_blank" rel="noopener noreferrer" style={{ color: "#a78bfa", textDecoration: "none" }}>CDC/Trussell ↗</a>). Više metoda se kombinuje množenjem (procena odozdo).</>),
    pregAssum6: (<><b data-hi>Devojka i mladić.</b> Kod devojke se partneri ne sabiraju — jedno začeće po ciklusu. Kod mladića računamo „bar jednu trudnoću među partnerkama“: više partnerki i seksa bez kontracepcije → veća šansa.</>),
    pregAssum7: (<><b data-hi>Mladić = PPI logika.</b> „Bar jedna trudnoća među partnerkama“: doprinos svakog tipa se množi. Stalni — po ciklusima ceo period; povremeni — veza trajanja dur, obnavlja se godišnje; avanture — jedan akt (per-act ≈ ⅕ ciklusne f — gruba procena).</>),
    pregAssum8: (<><b data-hi>Zašto je broj partnerki bitan za mladića.</b> Svaka partnerka je zaseban „pokušaj“: ona može zatrudneti nezavisno od drugih, pa računamo ne „koliko dece ukupno“ već šansu da se desi <b>bar jedna</b> trudnoća. Što više partnerki — i što više seksa bez pouzdane kontracepcije sa svakom — to je ta šansa veća, jer se nezavisne mogućnosti sabiraju. Za svaku partnerku uzimamo verovatnoću „nije zatrudnela“ i množimo ih; jedan minus taj proizvod je „bar jedna“. Kod devojke je obrnuto: partneri se ne sabiraju, jer je njen ciklus zajedničko usko grlo (jedno začeće po ciklusu).</>),
    pregAssumSources: (<>Izvori: <a href="https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>CDC / Trussell (kontracepcija) ↗</a> · <a href="https://www.nice.org.uk/guidance/cg156" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>NICE (plodnost i starost) ↗</a> · <a href="https://www.who.int/news-room/fact-sheets/detail/infertility" target="_blank" rel="noopener noreferrer" style={{ color: C.mid }}>SZO (neplodnost) ↗</a></>),
  },
};
const LANGS = ["en", "ru", "sr"];

const TYPES = [
  { key:"steady", label:{ en:"Steady", ru:"Постоянные", sr:"Stalni" }, color:"#f0a500", kind:"ongoing",  countMax:3,  countLab:{ en:"how many", ru:"сколько", sr:"koliko" }, addCount:1 },
  { key:"casual", label:{ en:"Recurring", ru:"Приходящие", sr:"Povremeni" }, color:"#2ec4b6", kind:"recurring", countMax:12, countLab:{ en:"how many per year", ru:"сколько в год", sr:"koliko godišnje" }, addCount:2 },
  { key:"hookup", label:{ en:"Hookups", ru:"Хукапы", sr:"Avanture" }, color:"#4dabf7", kind:"oneoff",   countMax:50, countLab:{ en:"how many per year", ru:"сколько в год", sr:"koliko godišnje" }, addCount:5 },
];
const BASE = {
  steady: { count:1, condom:100, perWeek:2.5, dur:0,   tested:0, poolMul:1.0 },
  casual: { count:2, condom:100, perWeek:1,   dur:2.5, tested:0, poolMul:2.0 },
  hookup: { count:2, condom:100, perWeek:0,   dur:0,   tested:0, poolMul:4.0 },
};
const mkCfg = (over = {}) => ({
  steady: { ...BASE.steady, ...(over.steady || { count: 0 }) },
  casual: { ...BASE.casual, ...(over.casual || { count: 0 }) },
  hookup: { ...BASE.hookup, ...(over.hookup || { count: 0 }) },
});
const PRESETS = [
  { key:"celibate", label:{ en:"Celibacy", ru:"Целибат", sr:"Celibat" } },
  { key:"mono", label:{ en:"Monogamy", ru:"Моногамия", sr:"Monogamija" }, steady:{count:1,perWeek:3} },
  { key:"serial", label:{ en:"Serial monogamy", ru:"Серийная моногамия", sr:"Serijska monogamija" }, casual:{count:0.4,perWeek:3,dur:24} },
  { key:"monogamish", label:{ en:"Monogamish", ru:"Monogamish", sr:"Monogamish" }, steady:{count:1,perWeek:3}, hookup:{count:2} },
  { key:"open", label:{ en:"Open / swing", ru:"Открытые / свинг", sr:"Otvorene / sving" }, steady:{count:1,perWeek:2}, casual:{count:4,perWeek:1,dur:2}, hookup:{count:3} },
  { key:"poly", label:{ en:"Polyamory", ru:"Полиамория", sr:"Poliamorija" }, steady:{count:2,perWeek:2}, casual:{count:1,perWeek:1,dur:6} },
  { key:"ons", label:{ en:"ONS / hookups", ru:"ONS / хукапы", sr:"ONS / avanture" }, hookup:{count:12} },
  { key:"core", label:{ en:"Core group", ru:"Core group", sr:"Core grupa" }, casual:{count:2,perWeek:1,dur:1}, hookup:{count:30} },
];

const veMulOf = (s, vaxHpv, vaxHbv) => {
  const vacc = (s.key === "hpv" && vaxHpv) || (s.key === "hbv" && vaxHbv);
  return s.vax && vacc ? (1 - s.vax.ve) : 1;
};

// Множитель передачи на акт по виду секса, относительно рецептивного вагинального (=1).
// Опорные значения по ВИЧ (Patel 2014, CDC, на 10 000 экспозиций): рец.ваг 8, ввод.ваг 4,
// рец.анал 138, ввод.анал 11, оральный — очень низкий. Для не-ВИЧ — грубое приближение.
const ACT_MUL = { vagR: 1, vagI: 0.5, analR: 17, analI: 1.4, oralR: 0.1, oralI: 0.02 };
const ACT_KEYS = ["vagR", "vagI", "analR", "analI", "oralR", "oralI"];
const actSelOf = (acts) => ACT_KEYS.filter((k) => acts[k]).map((k) => ACT_MUL[k]);

// Аддитивная модель видов секса: в каждом контакте практикуется каждая выбранная практика
// (со своим множителем к β). Выживаемость за один контакт = произведение «не заразиться» по
// всем практикам, поэтому добавление практики риск только повышает (или не меняет, если β·m≈0).
// factor = (1 − презерватив·e)·прививка. Пустой набор → 1 (риск 0). Каждый βeff клампится.
const encSurvOf = (s, actSel, factor) => {
  let surv = 1;
  for (let i = 0; i < actSel.length; i++) surv *= 1 - Math.min(0.999, s.beta * actSel[i] * factor);
  return surv;
};

function survivalAt(s, t, cfg, veMul, actSel = [1]) {
  let Srec = 1;
  ["casual", "hookup"].forEach((key) => {
    const T = cfg[key]; const cnt = T.count; // приходящие/хукапы — дробное число в год (флот)
    if (cnt <= 0) return;
    const encSurv = encSurvOf(s, actSel, (1 - (T.condom / 100) * s.e) * veMul);
    const k = key === "hookup" ? 1 : Math.max(1, T.perWeek * (52 / 12) * T.dur);
    const pEff = Math.min(1, s.p * T.poolMul * (1 - T.tested / 100));
    const transmit = 1 - Math.pow(encSurv, k);
    Srec *= Math.pow(1 - pEff * transmit, cnt);
  });
  const recCum = Math.pow(Srec, t / 12);
  let steadySurv = 1;
  const ST = cfg.steady; const sc = Math.round(ST.count);
  if (sc > 0) {
    const encSurv = encSurvOf(s, actSel, (1 - (ST.condom / 100) * s.e) * veMul);
    const k = Math.max(1, ST.perWeek * (52 / 12) * t);
    const pEff = Math.min(1, s.p * ST.poolMul * (1 - ST.tested / 100));
    const transmit = 1 - Math.pow(encSurv, k);
    steadySurv = Math.pow(1 - pEff * transmit, sc);
  }
  return recCum * steadySurv;
}

function Info({ text, dn }) {
  return (
    <span className={"src" + (dn ? " dn" : "")} tabIndex={0} style={{ marginLeft: 6, verticalAlign: "middle" }}>
      <span className="ic">i</span>
      <span className="box">{text}</span>
    </span>
  );
}
// Значение в таблице с тултипом-формулой (с подставленными числами). Пунктир — намёк на наведение.
function CellTip({ children, f }) {
  return (
    <span className="src" tabIndex={0}>
      <span style={{ borderBottom: `1px dotted ${C.dim}` }}>{children}</span>
      <span className="box" style={{ fontWeight: 400 }}><span data-f>{f}</span></span>
    </span>
  );
}

const RECV = { en: "receptive", ru: "принимающий", sr: "receptivni" };
const INS = { en: "insertive", ru: "вводящий", sr: "insertivni" };
const GIVE = { en: "giving", ru: "отдающий", sr: "aktivni" };
const SEXACTS = [
  { grp: { en: "Vaginal", ru: "Вагинальный", sr: "Vaginalni" }, excl: true, items: [["vagR", RECV], ["vagI", INS]] },
  { grp: { en: "Anal", ru: "Анальный", sr: "Analni" }, excl: false, items: [["analR", RECV], ["analI", INS]] },
  { grp: { en: "Oral", ru: "Оральный", sr: "Oralni" }, excl: false, items: [["oralR", RECV], ["oralI", GIVE]] },
];
// Анатомические противоречия: рецептивный вагинальный требует вагины, вводящие акты — пениса.
// Поэтому рец. вагинальный взаимоисключается с вводящим вагинальным И вводящим анальным.
const ACT_CONFLICTS = { vagR: ["vagI", "analI"], vagI: ["vagR"], analI: ["vagR"] };
function SexActs({ acts, setActs, lang }) {
  const toggle = (grp, key) => setActs((a) => {
    const next = { ...a, [key]: !a[key] };
    if (next[key]) (ACT_CONFLICTS[key] || []).forEach((k) => { next[k] = false; });
    return next;
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {SEXACTS.map((grp) => (
        <div key={grp.grp.en} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ color: C.mid, fontSize: 12.5, width: 96, flex: "0 0 96px" }}>{grp.grp[lang]}</span>
          <div style={{ display: "flex", gap: 6 }}>
            {grp.items.map(([key, lab]) => {
              const on = !!acts[key];
              return (
                <button key={key} onClick={() => toggle(grp, key)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: on ? `${C.accent}22` : "transparent", border: `1px solid ${on ? C.accent : C.border}`, color: on ? C.hi : C.dim, padding: "5px 11px", borderRadius: 999, cursor: "pointer", fontSize: 12.5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: on ? C.accent : C.dim, opacity: on ? 1 : 0.5 }} />{lab[lang]}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Slider({ label, value, set, min, max, step, valueText, hint, info, labelH }) {
  return (
    <div style={{ flex: 1, minWidth: 150 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 8, minHeight: labelH }}>
        <span style={{ color: C.mid, fontSize: 13, letterSpacing: 0.2, display: "inline-flex", alignItems: "center" }}>{label}{info && <Info text={info} />}</span>
        <span style={{ color: C.accent, fontSize: 16, fontWeight: 600, fontFamily: "ui-monospace, monospace", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{valueText}</span>
      </div>
      <input className="rng" type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(parseFloat(e.target.value))} />
      {hint && <div style={{ color: C.dim, fontSize: 11, marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

function TypeCard({ meta, t, setT, open, toggleOpen, lang, L }) {
  const col = meta.color;
  const floatCount = meta.kind !== "ongoing"; // приходящие/хукапы — дробное число в год
  const cnt = floatCount ? Math.round(t.count * 10) / 10 : Math.round(t.count);
  if (t.count <= 0) {
    return (
      <button onClick={() => setT({ count: meta.addCount })} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", background: "transparent", border: `1px dashed ${C.border}`, borderLeft: `3px solid ${col}77`, borderRadius: 10, padding: "11px 14px", cursor: "pointer" }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: col, opacity: 0.55 }} />
        <span style={{ color: C.mid, fontSize: 13.5 }}>{meta.label[lang]}</span>
        <span style={{ marginLeft: "auto", color: col, fontSize: 12.5, fontWeight: 600 }}>{L.addBtn}</span>
      </button>
    );
  }
  const cap = meta.kind === "ongoing" ? L.bgMul(t.poolMul) : meta.kind === "oneoff" ? L.oneActBg(t.poolMul) : `${fmtDur(t.dur, lang)} · ${L.bgMul(t.poolMul)}`;
  return (
    <div style={{ background: C.panel, border: `1px solid ${col}55`, borderLeft: `3px solid ${col}`, borderRadius: 12, padding: "13px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: col }} />
        <span style={{ color: C.hi, fontSize: 14, fontWeight: 600 }}>{meta.label[lang]}</span>
        <span style={{ color: C.dim, fontSize: 11, marginLeft: "auto", display: "inline-flex", alignItems: "center" }}>{cap}<Info text={L.poolInfo} /></span>
        <button onClick={() => setT({ count: 0 })} title={L.removeCard} aria-label={L.removeCard} onMouseEnter={(e) => (e.currentTarget.style.color = C.hi)} onMouseLeave={(e) => (e.currentTarget.style.color = C.dim)} style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontSize: 17, lineHeight: 1, padding: "0 2px", marginLeft: 6 }}>×</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <Slider label={meta.countLab[lang]} value={t.count} set={(v) => setT({ count: floatCount ? Math.round(v * 10) / 10 : Math.round(v) })} min={0} max={meta.countMax} step={floatCount ? 0.1 : 1} valueText={floatCount ? dec(cnt.toString(), lang) : `${cnt}`} />
        <Slider label={L.condom} value={t.condom} set={(v) => setT({ condom: v })} min={0} max={100} step={1} valueText={`${t.condom}%`} info={L.condomInfo} />
        <Slider label={L.tested} value={t.tested} set={(v) => setT({ tested: v })} min={0} max={100} step={1} valueText={`${t.tested}%`} info={L.testedInfo} />
      </div>
      <button onClick={toggleOpen} style={{ background: "transparent", border: "none", color: col, fontSize: 12, cursor: "pointer", padding: 0, marginTop: 12 }}>{open ? `▾ ${L.details}` : `▸ ${L.details}`}</button>
      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 13 }}>
          {meta.kind !== "oneoff" && (
            <Slider label={L.sexPerWeek} value={t.perWeek} set={(v) => setT({ perWeek: Math.round(v * 10) / 10 })} min={0.1} max={14} step={0.1} valueText={`${dec(t.perWeek.toFixed(1), lang)}×`} hint={L.sexPerWeekHint} />
          )}
          {meta.kind === "recurring" && (
            <Slider label={L.relDuration} value={t.dur} set={(v) => setT({ dur: v })} min={0} max={60} step={1} valueText={fmtDur(t.dur, lang)} hint={L.relDurationHint} />
          )}
          {meta.kind === "oneoff" && <div style={{ color: C.dim, fontSize: 12 }}>{L.oneoffNote}</div>}
          {meta.kind === "ongoing" && <div style={{ color: C.dim, fontSize: 12 }}>{L.ongoingNote}</div>}
        </div>
      )}
    </div>
  );
}

function packLanes(list) {
  const order = { steady: 0, casual: 1, hookup: 2 };
  const sorted = [...list].sort((a, b) => (order[a.type] - order[b.type]) || (a.start - b.start));
  const laneEnd = [];
  sorted.forEach((p) => {
    let lane = -1;
    for (let i = 0; i < laneEnd.length; i++) { if (laneEnd[i] <= p.start + 0.01) { lane = i; break; } }
    if (lane === -1) { lane = laneEnd.length; laneEnd.push(p.end); } else laneEnd[lane] = p.end;
    p.lane = lane;
  });
  return { list: sorted, lanes: Math.max(1, laneEnd.length) };
}
function buildPartnersTyped(cfg, horizonM) {
  const years = horizonM / 12;
  const list = [];
  const nSteady = Math.round(cfg.steady.count);
  for (let i = 0; i < nSteady; i++) list.push({ start: 0, end: horizonM, type: "steady" });
  let total = nSteady;
  const flow = (key, durM, seed) => {
    const perYear = cfg[key].count; if (perYear <= 0) return; // дробное число в год (флот)
    const tot = Math.round(perYear * years); total += tot;
    const shown = Math.min(tot, 240); if (shown <= 0) return;  // рисуем максимум столько, но спред — на весь горизонт
    const spacing = horizonM / shown;          // средний промежуток между началами связей
    const dense = durM > spacing;              // связь длиннее промежутка → настоящая одновременность
    for (let j = 0; j < shown; j++) {
      const h = Math.abs(Math.sin((j + 1 + seed) * 12.9898) * 43758.5453) % 1;
      if (dense) {                             // плотно: связи накладываются (свинг/поли/хукапы)
        const base = (j + 0.5) * spacing;
        const start = Math.min(horizonM - 0.05, Math.max(0, base + (h - 0.5) * spacing * 0.8));
        const d = Math.max(0.2, durM * (0.7 + h * 0.6));
        list.push({ start, end: Math.min(horizonM, start + d), type: key });
      } else {                                 // последовательно: один партнёр за раз (серийная моногамия)
        const start = Math.min(horizonM - 0.05, j * spacing + h * spacing * 0.1);
        const d = Math.max(0.2, Math.min(durM * (0.8 + h * 0.25), spacing * 0.85));
        list.push({ start, end: Math.min(horizonM, start + d), type: key });
      }
    }
  };
  flow("casual", cfg.casual.dur, 0);
  flow("hookup", 0.3, 99);
  return { list, total };
}
function Timeline({ packed, horizonM, years, lang }) {
  const { list, lanes } = packed;
  const gap = lanes > 12 ? 2 : 4;
  const rowH = Math.max(4, Math.min(15, Math.floor(240 / Math.max(1, lanes)) - gap));
  const yt = []; const ts = years <= 12 ? 1 : years <= 30 ? 5 : 10;
  for (let y = 0; y <= years; y += ts) yt.push(y);
  return (
    <div>
      <div style={{ position: "relative", height: lanes * (rowH + gap) }}>
        {Array.from({ length: lanes }).map((_, i) => (<div key={"l" + i} style={{ position: "absolute", left: 0, right: 0, top: i * (rowH + gap), height: rowH, background: C.panel2, borderRadius: 3 }} />))}
        {list.map((p, idx) => { const col = p.type === "steady" ? "#f0a500" : p.type === "casual" ? "#2ec4b6" : "#4dabf7"; return <div key={idx} title={p.type} style={{ position: "absolute", top: p.lane * (rowH + gap), height: rowH, left: `${(p.start / horizonM) * 100}%`, width: `${Math.max(0.5, ((p.end - p.start) / horizonM) * 100)}%`, background: col, borderRadius: 3, opacity: 0.88 }} />; })}
      </div>
      <div style={{ position: "relative", height: 16, marginTop: 4 }}>
        {yt.map((y) => (<span key={y} style={{ position: "absolute", left: `${(y / years) * 100}%`, fontSize: 11, color: C.dim, transform: y === 0 ? "none" : "translateX(-50%)" }}>{y === 0 ? "0" : `${y}${yrShort(lang)}`}</span>))}
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label, hidden, lang, L }) {
  if (!active || !payload?.length) return null;
  const yrs = Math.floor(label / 12), mos = label % 12;
  const rows = payload.filter((e) => !hidden[e.dataKey]).sort((a, b) => b.value - a.value);
  return (
    <div style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 12 }}>
      <div style={{ color: C.mid, marginBottom: 6 }}>{yrs > 0 ? yrs + " " + yrShort(lang) + " " : ""}{mos} {moWord(lang)}</div>
      {rows.map((e) => { const s = STIS.find((x) => x.key === e.dataKey); return (<div key={e.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 18, color: C.hi }}><span><span style={{ color: e.stroke }}>●</span> {s ? s.label[lang] : L.anyLabel}</span><span>{pctVal(e.value, lang)}</span></div>); })}
    </div>
  );
}

function Breakdown({ s, envMul = 1, cfg, years, veMul, actSel = [1], lang, L }) {
  const horizonM = years * 12;
  const yw = yearsWord(years, lang);
  const fmtP = (v) => pctVal(v * 100, lang);
  // Точность для формул: для малых значений оставляем десятую, чтобы умножения сходились (4,5% × 2 = 9%).
  const pp = (x) => dec(x * 100 < 10 ? (x * 100).toFixed(1).replace(/\.0$/, "") : String(Math.round(x * 100)), lang) + "%";
  const active = TYPES.map((meta) => {
    const T = cfg[meta.key]; const cnt = meta.kind === "ongoing" ? Math.round(T.count) : T.count;
    if (cnt <= 0) return null;
    const encSurv = encSurvOf(s, actSel, (1 - (T.condom / 100) * s.e) * veMul);
    const actEff = 1 - encSurv; // передача за один контакт (все практики), если партнёр заражён
    const k = meta.kind === "oneoff" ? 1 : meta.kind === "ongoing" ? Math.max(1, T.perWeek * (52 / 12) * horizonM) : Math.max(1, T.perWeek * (52 / 12) * T.dur);
    const pEff = Math.min(1, s.p * T.poolMul * (1 - T.tested / 100));
    const transmit = 1 - Math.pow(encSurv, k);
    const perPartner = pEff * transmit;
    const toHorizon = meta.kind === "ongoing" ? 1 - Math.pow(1 - perPartner, cnt) : 1 - Math.pow(Math.pow(1 - perPartner, cnt), years);
    // Формулы с подставленными значениями — тултип на каждую посчитанную ячейку.
    const D = (x) => dec(String(x), lang);
    const fK = meta.kind === "oneoff" ? "= 1" : meta.kind === "ongoing" ? `${D(T.perWeek)} × 52/12 × ${horizonM} = ${Math.round(k)}` : `${D(T.perWeek)} × 52/12 × ${D(T.dur)} = ${Math.round(k)}`;
    // βeff по каждой выбранной практике — подставляем числа, без буквенных обозначений.
    const factor = (1 - (T.condom / 100) * s.e) * veMul;
    const betas = actSel.map((m) => Math.min(0.999, s.beta * m * factor));
    const fAct = betas.length ? `1 − ${betas.map((b) => `(1 − ${pctAct(b, lang)})`).join("")} = ${pctAct(actEff, lang)}` : "= 0%";
    // Распространённость и среда — раздельно (s.p уже включает среду, делим обратно).
    const basePrev = s.p / envMul;
    const rawChance = s.p * T.poolMul * (1 - T.tested / 100);
    const fChance = `${pp(basePrev)} × ${D(envMul)} × ${D(T.poolMul)} × (1 − ${T.tested}%) = ${rawChance > 1 ? pp(rawChance) + " → 100%" : pp(pEff)}`;
    const fRisk = meta.kind === "ongoing" ? `1 − (1 − ${fmtP(perPartner)})^${cnt} = ${fmtP(toHorizon)}` : `1 − ((1 − ${fmtP(perPartner)})^${D(cnt)})^${years} = ${fmtP(toHorizon)}`;
    return { meta, T, cnt, actEff, k, pEff, toHorizon, fK, fAct, fChance, fRisk };
  }).filter(Boolean);
  if (active.length === 0) return <div style={{ color: C.mid, fontSize: 13, padding: "8px 0" }}>{L.noActivePartners}</div>;
  const totalRisk = 1 - survivalAt(s, horizonM, cfg, veMul, actSel);
  const fTotal = `1 − ${active.map((r) => `(1 − ${fmtP(r.toHorizon)})`).join(" × ")} = ${fmtP(totalRisk)}`;
  const condAll = (pct) => ({ steady: { ...cfg.steady, condom: pct }, casual: { ...cfg.casual, condom: pct }, hookup: { ...cfg.hookup, condom: pct } });
  const ho0 = 1 - survivalAt(s, horizonM, condAll(0), veMul, actSel);
  const ho100 = 1 - survivalAt(s, horizonM, condAll(100), veMul, actSel);
  const bareAct = 1 - encSurvOf(s, actSel, 1);
  const condAct = 1 - encSurvOf(s, actSel, 1 - s.e);
  const cutAct = bareAct > 0 ? Math.round((1 - condAct / bareAct) * 100) : Math.round(s.e * 100);
  const cutHor = ho0 > 0 ? Math.round((1 - ho100 / ho0) * 100) : 0;
  const bars = [
    { lab: L.barAct, a: bareAct, b: condAct, fmt: (v) => pctAct(v, lang) },
    { lab: L.barHor(years, yw), a: ho0, b: ho100, fmt: fmtP },
  ];
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ color: C.hi, fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>{L.condomBlockTitle}</div>
        <div style={{ display: "flex", gap: 16, fontSize: 12, color: C.mid, marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: "#ff7b73" }} />{L.withoutCondom}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: "#4dd4ac" }} />{L.withCondom}</span>
        </div>
        {bars.map((row, i) => { const max = Math.max(row.a, row.b, 1e-9); return (
          <div key={i} style={{ marginBottom: 13 }}>
            <div style={{ fontSize: 12, color: C.dim, marginBottom: 6 }}>{row.lab}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <div style={{ flex: 1, height: 16, background: C.panel2, borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${Math.max(2, (row.a / max) * 100)}%`, height: "100%", background: "#ff7b73" }} /></div>
              <span className="num" style={{ width: 56, textAlign: "right", fontSize: 12.5, color: C.hi, fontWeight: 600 }}>{row.fmt(row.a)}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, height: 16, background: C.panel2, borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${Math.max(2, (row.b / max) * 100)}%`, height: "100%", background: "#4dd4ac" }} /></div>
              <span className="num" style={{ width: 56, textAlign: "right", fontSize: 12.5, color: C.hi, fontWeight: 600 }}>{row.fmt(row.b)}</span>
            </div>
          </div>
        ); })}
        <div className="rich" style={{ fontSize: 12.5, color: C.mid, lineHeight: 1.55, marginTop: 6 }}>
          {cutAct - cutHor >= 4 ? L.satDrop(years, yw, cutAct, cutHor) : L.satFlat(years, yw, cutHor)}
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, margin: "4px 0 14px" }} />
      <div className="rich" style={{ fontSize: 13, color: C.mid, lineHeight: 1.6, marginBottom: 12 }}>{L.contribIntro(years, yw)}</div>
      <div style={{ overflowX: "auto" }}>
        <table className="inf" style={{ minWidth: 560 }}>
          <thead><tr><th>{L.thType}</th><th>{L.thPartners}</th><th><span style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>{L.thContacts}<Info dn text={L.thContactsInfo} /></span></th><th><span style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>{L.thTransPerAct}<Info dn text={L.thTransPerActInfo} /></span></th><th><span style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>{L.thChanceInf}<Info dn text={L.thChanceInfInfo} /></span></th><th><span style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>{L.thRiskHor(years, yw)}<Info dn text={L.thRiskHorInfo} /></span></th></tr></thead>
          <tbody>
            {active.map((r) => (
              <tr key={r.meta.key} style={{ borderLeft: `3px solid ${r.meta.color}` }}>
                <td style={{ whiteSpace: "nowrap", color: C.hi }}><span style={{ color: r.meta.color, marginRight: 6 }}>●</span>{r.meta.label[lang]}</td>
                <td className="num">{dec((Math.round(r.cnt * 10) / 10).toString(), lang)}{r.meta.kind !== "ongoing" ? L.perYear : ""}</td>
                <td className="num"><CellTip f={r.fK}>{Math.round(r.k)}</CellTip></td>
                <td className="num"><CellTip f={r.fAct}>{pctAct(r.actEff, lang)}</CellTip></td>
                <td className="num"><CellTip f={r.fChance}>{pp(r.pEff)}</CellTip></td>
                <td className="num" style={{ color: C.hi, fontWeight: 600 }}><CellTip f={r.fRisk}>{fmtP(r.toHorizon)}</CellTip></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `2px solid ${C.border}` }}>
              <td colSpan={5} style={{ color: C.hi, fontWeight: 600 }}><span style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>{L.thTotal}<Info dn text={L.thTotalInfo} /></span></td>
              <td className="num" style={{ color: s.color, fontWeight: 700 }}><CellTip f={fTotal}>{fmtP(totalRisk)}</CellTip></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

const OPEN = PRESETS.find((p) => p.key === "open");

// ───────────────────────── МОДЕЛЬ БЕРЕМЕННОСТИ (отдельный движок) ─────────────────────────
// Единица — менструальный цикл (≈месяц). Кумулятив P = 1 − (1 − годовой_отказ)^лет.
// Надёжно: таблица эффективности контрацепции (CDC/Trussell, типичное использование).
// Оценка: фертильность по возрасту f(age), частотная кривая, per-act для разовых контактов.
const SEG = (on) => ({ padding: "9px 18px", borderRadius: 10, border: `1px solid ${on ? C.accent : C.border}`, background: on ? C.accent : "transparent", color: on ? C.bg : C.mid, fontWeight: on ? 700 : 500, cursor: "pointer", fontSize: 14 });
const SUBSEG = (on, col) => ({ padding: "7px 14px", borderRadius: 999, border: `1px solid ${on ? col : C.border}`, background: on ? `${col}22` : "transparent", color: on ? C.hi : C.mid, cursor: "pointer", fontSize: 13, fontWeight: on ? 600 : 400 });

// Фертильность за цикл при регулярном незащищённом сексе, по возрасту женщины (ОЦЕНКА тренда).
function fAge(age) {
  if (age <= 25) return 0.23;
  if (age <= 29) return 0.20;
  if (age <= 31) return 0.17;
  if (age <= 34) return 0.15;
  if (age <= 37) return 0.11;
  if (age <= 39) return 0.09;
  if (age <= 41) return 0.06;
  if (age <= 43) return 0.035;
  if (age <= 45) return 0.015;
  return 0.005;
}
// Множитель частоты секса к f за цикл (ОЦЕНКА формы).
function kFreq(perWeek) {
  if (perWeek >= 4) return 1.15;
  if (perWeek >= 3) return 1.1;
  if (perWeek >= 2) return 1.0;
  if (perWeek >= 1) return 0.8;
  if (perWeek >= 0.5) return 0.6;
  return 0.45;
}
// Контрацепция: типичное использование, % незапланированных беременностей за 1 год (CDC/Trussell).
// perfect/typical — доля за ПЕРВЫЙ ГОД (0..1). sev — РЕДАКТОРСКАЯ шкала 1–5 (цвет-код, не данные).
// control: 'toggle' — постоянно; 'perAct' — на акт (слайдер доли); 'oneOff' — разово (не на кривую).
// label/side/guide.{how,side,who} — локализованы {en,ru,sr}; sources/числа — общие.
const CONTRA = [
  { key: "none", label: { en: "No method", ru: "Без метода", sr: "Bez metoda" }, perfect: 0.85, typical: 0.85, sev: 1, control: "toggle",
    side: { en: "No side effects, but the maximum chance of pregnancy and zero protection from STIs.", ru: "Побочек нет, но максимальный шанс беременности и ноль защиты от ИППП.", sr: "Nema neželjenih efekata, ali maksimalna šansa za trudnoću i nula zaštite od PPI." },
    guide: { how: { en: "No contraception is used. Baseline: ~85 of 100 couples conceive within a year.", ru: "Контрацепция не используется. Базовая линия: ~85 из 100 пар беременеют за год.", sr: "Kontracepcija se ne koristi. Osnovna linija: ~85 od 100 parova zatrudni za godinu." }, side: { en: "There is no method as such; the risk is unwanted pregnancy and infections.", ru: "Метод как таковой отсутствует; риск — нежелательная беременность и инфекции.", sr: "Metoda kao takvog nema; rizik je neželjena trudnoća i infekcije." }, who: { en: "Only for those planning a pregnancy or ready for one.", ru: "Только для тех, кто планирует беременность или готов к ней.", sr: "Samo za one koji planiraju trudnoću ili su spremni na nju." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "withdrawal", label: { en: "Withdrawal", ru: "Прерванный акт", sr: "Prekinuti akt" }, perfect: 0.04, typical: 0.22, sev: 1, control: "perAct",
    side: { en: "Harmless in itself; high failure rate and zero protection from STIs.", ru: "Сам по себе безвреден; высокая частота ошибок и ноль защиты от ИППП.", sr: "Sam po sebi bezopasan; visoka stopa grešaka i nula zaštite od PPI." },
    guide: { how: { en: "Withdrawing the penis before ejaculation.", ru: "Извлечение полового члена до эякуляции.", sr: "Izvlačenje penisa pre ejakulacije." }, side: { en: "No physical harm; depends on self-control, pre-ejaculate may contain sperm.", ru: "Физического вреда нет; зависит от самоконтроля, предэякулят может содержать сперматозоиды.", sr: "Nema fizičke štete; zavisi od samokontrole, predejakulat može sadržati spermatozoide." }, who: { en: "Cheap and always available, but one of the least reliable methods in typical use.", ru: "Дёшево и всегда доступно, но один из наименее надёжных методов при типичном использовании.", sr: "Jeftino i uvek dostupno, ali jedan od najmanje pouzdanih metoda pri tipičnom korišćenju." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "fam", label: { en: "Calendar / fertile window", ru: "Календарь / фертильное окно", sr: "Kalendar / plodni prozor" }, perfect: 0.004, typical: 0.24, sev: 1, control: "perAct",
    side: { en: "No side effects; needs discipline, the gap between perfect and typical is huge.", ru: "Без побочек; нужна дисциплина, разрыв идеального и типичного огромен.", sr: "Bez neželjenih efekata; potrebna disciplina, jaz između idealnog i tipičnog je ogroman." },
    guide: { how: { en: "Tracking fertility signs (temperature, mucus, calendar) and abstinence/barrier on fertile days.", ru: "Отслеживание признаков фертильности (температура, слизь, календарь) и воздержание/барьер в фертильные дни.", sr: "Praćenje znakova plodnosti (temperatura, sluz, kalendar) i uzdržavanje/barijera u plodnim danima." }, side: { en: "No harm; the cost is self-discipline and abstinence; errors in recognizing the window lead to pregnancy.", ru: "Вреда нет; цена — самодисциплина и воздержание; ошибки распознавания окна ведут к беременности.", sr: "Nema štete; cena je samodisciplina i uzdržavanje; greške u prepoznavanju prozora vode trudnoći." }, who: { en: "Perfect use (symptothermal) is very effective, typical use is one of the least reliable. The ideal depends on the method (symptothermal ~0.4%, calendar ~5%).", ru: "Идеальное использование (симптотермальный) очень эффективно, типичное — одно из самых ненадёжных. Идеал зависит от метода (символотермальный ~0,4%, календарный ~5%).", sr: "Idealno korišćenje (simptotermalni) je veoma efikasno, tipično — jedno od najmanje pouzdanih. Idealno zavisi od metoda (simptotermalni ~0,4%, kalendarski ~5%)." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "condom_m", label: { en: "Condom (male)", ru: "Презерватив (муж.)", sr: "Kondom (muški)" }, perfect: 0.02, typical: 0.18, sev: 1, control: "perAct",
    side: { en: "Occasional latex allergy; may tear/slip. Protects from STIs.", ru: "Изредка аллергия на латекс; может порваться/соскользнуть. Защищает от ИППП.", sr: "Ponekad alergija na lateks; može pući/skliznuti. Štiti od PPI." },
    guide: { how: { en: "A barrier on the penis that holds sperm. Also lowers STI risk.", ru: "Барьер на половом члене, удерживающий сперму. Снижает и риск ИППП.", sr: "Barijera na penisu koja zadržava spermu. Smanjuje i rizik od PPI." }, side: { en: "Possible latex allergy (polyurethane exists); risk of tearing/slipping.", ru: "Возможна аллергия на латекс (есть полиуретановые); риск разрыва/соскальзывания.", sr: "Moguća alergija na lateks (postoje poliuretanski); rizik od pucanja/klizanja." }, who: { en: "Suits almost everyone, no prescription. STI protection is a plus to any method. (Updated CDC gives typical 13% instead of 18%.)", ru: "Подходит почти всем, без рецепта. Защита от ИППП — плюс к любому методу. (Обновлённая CDC даёт типичное 13% вместо 18%.)", sr: "Odgovara skoro svima, bez recepta. Zaštita od PPI je plus uz svaki metod. (Ažurirani CDC daje tipično 13% umesto 18%.)" } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }, { label: "CDC", url: "https://www.cdc.gov/contraception/about/index.html" }] },
  { key: "condom_f", label: { en: "Condom (female)", ru: "Презерватив (жен.)", sr: "Kondom (ženski)" }, perfect: 0.05, typical: 0.21, sev: 1, control: "perAct",
    side: { en: "May shift/be noisy; protects from STIs.", ru: "Может смещаться/шуметь; защищает от ИППП.", sr: "Može se pomerati/biti bučan; štiti od PPI." },
    guide: { how: { en: "A soft sleeve in the vagina with rings that holds sperm.", ru: "Мягкий рукав во влагалище с кольцами, задерживает сперму.", sr: "Mekani rukav u vagini sa prstenovima koji zadržava spermu." }, side: { en: "Sometimes shifting/discomfort; irritation is rare. Protects from STIs.", ru: "Иногда смещение/дискомфорт; раздражения редки. Защищает от ИППП.", sr: "Ponekad pomeranje/nelagodnost; iritacije su retke. Štiti od PPI." }, who: { en: "An alternative to the latex male one; gives the woman control over the barrier. No prescription.", ru: "Альтернатива латексному мужскому; даёт женщине контроль над барьером. Без рецепта.", sr: "Alternativa lateksu muškom; daje ženi kontrolu nad barijerom. Bez recepta." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "diaphragm", label: { en: "Diaphragm / cap", ru: "Диафрагма / колпачок", sr: "Dijafragma / kapica" }, perfect: 0.06, typical: 0.12, sev: 1, control: "perAct",
    side: { en: "Size fitting; slightly higher cystitis risk; used with spermicide.", ru: "Подбор по размеру; чуть выше риск цистита; со спермицидом.", sr: "Biranje veličine; malo veći rizik od cistitisa; sa spermicidom." },
    guide: { how: { en: "A cup with spermicide covering the cervix; inserted before the act.", ru: "Чашечка со спермицидом, закрывающая шейку матки; вводится перед актом.", sr: "Čašica sa spermicidom koja pokriva grlić materice; uvodi se pre akta." }, side: { en: "More frequent cystitis, irritation from spermicide; needs fitting and training.", ru: "Учащённые циститы, раздражение от спермицида; нужен подбор и обучение.", sr: "Češći cistitisi, iritacija od spermicida; potrebno biranje i obuka." }, who: { en: "An option when hormones are contraindicated. For women who have given birth (and for the cap) effectiveness is notably lower.", ru: "Вариант при противопоказаниях к гормонам. У рожавших (и для колпачка) эффективность заметно ниже.", sr: "Opcija pri kontraindikacijama na hormone. Kod žena koje su rađale (i za kapicu) efikasnost je znatno niža." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "spermicide", label: { en: "Spermicides", ru: "Спермициды", sr: "Spermicidi" }, perfect: 0.18, typical: 0.28, sev: 1, control: "perAct",
    side: { en: "Mucosal irritation; frequent nonoxynol-9 may raise STI risk.", ru: "Раздражение слизистой; частый ноноксинол-9 может повышать риск ИППП.", sr: "Iritacija sluznice; čest nonoksinol-9 može povećati rizik od PPI." },
    guide: { how: { en: "Gel/foam/suppositories with a substance that kills sperm; inserted before the act.", ru: "Гель/пена/свечи с веществом, убивающим сперматозоиды; вводятся перед актом.", sr: "Gel/pena/supozitorije sa supstancom koja ubija spermatozoide; uvode se pre akta." }, side: { en: "Irritation; with frequent use nonoxynol-9 damages the mucosa and may RAISE STI risk.", ru: "Раздражение; при частом применении ноноксинол-9 повреждает слизистую и может ПОВЫШАТЬ риск ИППП.", sr: "Iritacija; pri čestom korišćenju nonoksinol-9 oštećuje sluznicu i može POVEĆATI rizik od PPI." }, who: { en: "One of the least reliable alone; usually combined with a barrier. No prescription.", ru: "Один из наименее надёжных в одиночку; обычно сочетают с барьером. Без рецепта.", sr: "Jedan od najmanje pouzdanih samostalno; obično se kombinuje sa barijerom. Bez recepta." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "cok", label: { en: "Combined pill (COC)", ru: "КОК (таблетки)", sr: "Kombinovana pilula (KOK)" }, perfect: 0.003, typical: 0.09, sev: 2, control: "toggle",
    side: { en: "Estrogen: nausea, mood changes, rarely thrombosis; not with some risk factors.", ru: "Эстроген: тошнота, изменения настроения, редко тромбозы; не при ряде факторов риска.", sr: "Estrogen: mučnina, promene raspoloženja, retko tromboze; ne uz neke faktore rizika." },
    guide: { how: { en: "Estrogen + progestin daily: suppress ovulation, thicken mucus.", ru: "Эстроген + прогестин ежедневно: подавляют овуляцию, сгущают слизь.", sr: "Estrogen + progestin dnevno: potiskuju ovulaciju, zgušnjavaju sluz." }, side: { en: "Nausea, breast tenderness, mood/libido changes, spotting. A rare but serious risk — venous thrombosis (higher in smokers 35+).", ru: "Тошнота, болезненность груди, изменения настроения/либидо, мажущие выделения. Редкий, но серьёзный риск — венозный тромбоз (выше у курящих 35+).", sr: "Mučnina, osetljivost grudi, promene raspoloženja/libida, krvarenje. Redak ali ozbiljan rizik — venska tromboza (veći kod pušača 35+)." }, who: { en: "Contraindicated in migraine with aura, thrombosis, smoking after 35, severe hypertension. Bonuses: regular cycle, less acne.", ru: "Противопоказаны при мигрени с аурой, тромбозах, курении после 35, тяжёлой гипертензии. Бонусы: регулярный цикл, меньше акне.", sr: "Kontraindikovane kod migrene sa aurom, tromboze, pušenja posle 35, teške hipertenzije. Bonusi: redovan ciklus, manje akni." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }, { label: "CDC", url: "https://www.cdc.gov/contraception/about/index.html" }] },
  { key: "minipill", label: { en: "Mini-pill (progestin)", ru: "Мини-пили (прогестин)", sr: "Mini-pilula (progestin)" }, perfect: 0.003, typical: 0.09, sev: 2, control: "toggle",
    side: { en: "Require strict timing; irregular bleeding. (Numbers = same as COC — estimate.)", ru: "Требуют строгого времени приёма; нерегулярные кровотечения. (Числа = как у КОК — оценка.)", sr: "Zahtevaju strogo vreme uzimanja; nepravilna krvarenja. (Brojevi = kao KOK — procena.)" },
    guide: { how: { en: "Progestin only daily; thickens mucus, partially suppresses ovulation. Strictly tied to dosing time.", ru: "Только прогестин ежедневно; сгущают слизь, частично подавляют овуляцию. Жёстко привязаны ко времени приёма.", sr: "Samo progestin dnevno; zgušnjava sluz, delimično potiskuje ovulaciju. Strogo vezana za vreme uzimanja." }, side: { en: "Irregular/spotting bleeding — the most common effect. Without estrogen — fewer thromboses.", ru: "Нерегулярные/мажущие кровотечения — самый частый эффект. Без эстрогена — меньше тромбозов.", sr: "Nepravilna/oskudna krvarenja — najčešći efekat. Bez estrogena — manje tromboza." }, who: { en: "An option when estrogen is contraindicated (breastfeeding, migraine with aura, smoking 35+). CDC gives a row shared with COC — no separate numbers, this is an estimate.", ru: "Вариант при противопоказаниях к эстрогену (ГВ, мигрень с аурой, курение 35+). CDC даёт общую с КОК строку — отдельных чисел нет, это оценка.", sr: "Opcija pri kontraindikacijama na estrogen (dojenje, migrena sa aurom, pušenje 35+). CDC daje red zajednički sa KOK — zasebnih brojeva nema, ovo je procena." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "patch", label: { en: "Patch", ru: "Пластырь", sr: "Flaster" }, perfect: 0.003, typical: 0.09, sev: 2, control: "toggle",
    side: { en: "Like COC (estrogen); skin irritation under the patch.", ru: "Как у КОК (эстроген); раздражение кожи под пластырем.", sr: "Kao KOK (estrogen); iritacija kože ispod flastera." },
    guide: { how: { en: "A skin patch with estrogen + progestin; changed once a week.", ru: "Накожный пластырь с эстрогеном + прогестином; меняется раз в неделю.", sr: "Flaster na koži sa estrogenom + progestinom; menja se jednom nedeljno." }, side: { en: "Profile like COC; skin irritation, risk of detaching. At ≥90 kg effectiveness may drop.", ru: "Профиль как у КОК; раздражение кожи, риск отклеивания. При весе ≥90 кг эффективность может снижаться.", sr: "Profil kao KOK; iritacija kože, rizik od odlepljivanja. Pri težini ≥90 kg efikasnost može opasti." }, who: { en: "Same contraindications as COC. Convenient for those who forget daily pills.", ru: "Те же противопоказания, что у КОК. Удобен забывающим ежедневные таблетки.", sr: "Iste kontraindikacije kao KOK. Pogodan za one koji zaboravljaju dnevne pilule." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "ring", label: { en: "Vaginal ring", ru: "Вагинальное кольцо", sr: "Vaginalni prsten" }, perfect: 0.003, typical: 0.09, sev: 2, control: "toggle",
    side: { en: "Like COC; sometimes discharge/irritation, may fall out.", ru: "Как у КОК; иногда выделения/раздражение, может выпадать.", sr: "Kao KOK; ponekad sekret/iritacija, može ispasti." },
    guide: { how: { en: "A flexible ring in the vagina with estrogen + progestin; stays 3 weeks.", ru: "Гибкое кольцо во влагалище с эстрогеном + прогестином; стоит 3 недели.", sr: "Fleksibilni prsten u vagini sa estrogenom + progestinom; stoji 3 nedelje." }, side: { en: "Profile like COC; locally — discharge, irritation, rarely falling out.", ru: "Профиль как у КОК; локально — выделения, раздражение, изредка выпадение.", sr: "Profil kao KOK; lokalno — sekret, iritacija, retko ispadanje." }, who: { en: "Same contraindications as COC. Convenient: once a month, not daily.", ru: "Те же противопоказания, что у КОК. Удобно: раз в месяц, не ежедневно.", sr: "Iste kontraindikacije kao KOK. Pogodno: jednom mesečno, ne svakodnevno." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "depo", label: { en: "Injection (Depo)", ru: "Инъекции (Депо)", sr: "Injekcija (Depo)" }, perfect: 0.002, typical: 0.06, sev: 3, control: "toggle",
    side: { en: "Reversible bone-mass loss; irregular bleeding; slow return of fertility.", ru: "Обратимая потеря костной массы; нерегулярные кровотечения; долгий возврат фертильности.", sr: "Reverzibilni gubitak koštane mase; nepravilna krvarenja; spor povratak plodnosti." },
    guide: { how: { en: "A progestin injection every ~3 months: suppresses ovulation.", ru: "Инъекция прогестина каждые ~3 месяца: подавляет овуляцию.", sr: "Injekcija progestina svaka ~3 meseca: potiskuje ovulaciju." }, side: { en: "Irregular bleeding (often amenorrhea), weight gain, reversible drop in bone density. Return of fertility — up to 9–12 mo after stopping.", ru: "Нерегулярные кровотечения (часто аменорея), набор веса, обратимое снижение костной плотности. Возврат фертильности — до 9–12 мес после отмены.", sr: "Nepravilna krvarenja (često amenoreja), dobijanje na težini, reverzibilno smanjenje koštane gustine. Povratak plodnosti — do 9–12 mes. nakon prestanka." }, who: { en: "Convenient for those suited by a quarterly shot. Caution with osteoporosis risk and near-term pregnancy planning.", ru: "Удобно тем, кому подходит укол раз в квартал. Осторожно при риске остеопороза и скором планировании беременности.", sr: "Pogodno onima kojima odgovara injekcija jednom kvartalno. Oprez kod rizika od osteoporoze i skorog planiranja trudnoće." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "iud_cu", label: { en: "Copper IUD", ru: "Медная ВМС", sr: "Bakarna spirala" }, perfect: 0.006, typical: 0.008, sev: 2, control: "toggle",
    side: { en: "Heavier/more painful periods; insertion risk (rarely perforation).", ru: "Более обильные/болезненные месячные; риск при установке (редко перфорация).", sr: "Obilnije/bolnije menstruacije; rizik pri postavljanju (retko perforacija)." },
    guide: { how: { en: "A T-shaped device in the uterus; copper is toxic to sperm. Hormone-free, up to 10–12 years.", ru: "Т-образное устройство в матке; медь токсична для сперматозоидов. Без гормонов, до 10–12 лет.", sr: "Uređaj u obliku slova T u materici; bakar je toksičan za spermatozoide. Bez hormona, do 10–12 godina." }, side: { en: "Heavier and more painful periods, especially the first months. On insertion — pain, rarely perforation/expulsion.", ru: "Более обильные и болезненные менструации, особенно первые месяцы. При установке — боль, редко перфорация/экспульсия.", sr: "Obilnije i bolnije menstruacije, naročito prvih meseci. Pri postavljanju — bol, retko perforacija/ekspulzija." }, who: { en: "A hormone-free long-term method; works as emergency contraception within the first 5 days. «Fit and forget» — perfect ≈ typical.", ru: "Негормональный долгий метод; годится как экстренная контрацепция в первые 5 дней. «Поставил и забыл» — идеальное≈типичное.", sr: "Nehormonski dugotrajni metod; služi kao hitna kontracepcija u prvih 5 dana. „Postavi i zaboravi“ — idealno≈tipično." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "iud_lng", label: { en: "Hormonal IUD", ru: "Гормональная ВМС", sr: "Hormonska spirala" }, perfect: 0.002, typical: 0.002, sev: 2, control: "toggle",
    side: { en: "Irregular/scant bleeding the first months; insertion risks.", ru: "Нерегулярные/скудные кровотечения первые месяцы; риски при установке.", sr: "Nepravilna/oskudna krvarenja prvih meseci; rizici pri postavljanju." },
    guide: { how: { en: "A T-shaped device releases progestin: thickens mucus, thins the endometrium. 3–8 years.", ru: "Т-образное устройство выделяет прогестин: сгущает слизь, истончает эндометрий. 3–8 лет.", sr: "Uređaj u obliku slova T oslobađa progestin: zgušnjava sluz, istanjuje endometrijum. 3–8 godina." }, side: { en: "Irregular spotting the first months, then often scant periods or amenorrhea. On insertion — pain, rarely perforation.", ru: "Нерегулярные мажущие выделения первые месяцы, затем часто скудные месячные или аменорея. При установке — боль, редко перфорация.", sr: "Nepravilna oskudna krvarenja prvih meseci, zatim često oskudne menstruacije ili amenoreja. Pri postavljanju — bol, retko perforacija." }, who: { en: "Very reliable, «fit and forget»; reduces heavy periods. Perfect = typical.", ru: "Очень надёжно, «поставил-забыл»; уменьшает обильные месячные. Идеальное=типичное.", sr: "Veoma pouzdano, „postavi i zaboravi“; smanjuje obilne menstruacije. Idealno=tipično." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "implant", label: { en: "Implant", ru: "Имплант", sr: "Implant" }, perfect: 0.0005, typical: 0.0005, sev: 2, control: "toggle",
    side: { en: "Unpredictable bleeding; insertion/removal — a minor subcutaneous procedure.", ru: "Непредсказуемые кровотечения; установка/удаление — малая процедура под кожей.", sr: "Nepredvidiva krvarenja; postavljanje/uklanjanje — mala potkožna procedura." },
    guide: { how: { en: "A flexible rod with progestin under the upper-arm skin; suppresses ovulation. ~3–5 years.", ru: "Гибкий стержень с прогестином под кожей плеча; подавляет овуляцию. ~3–5 лет.", sr: "Fleksibilni štapić sa progestinom ispod kože nadlaktice; potiskuje ovulaciju. ~3–5 godina." }, side: { en: "Unpredictable bleeding — the main reason for discontinuation; possible acne, headaches. Insertion/removal — a minor procedure.", ru: "Непредсказуемые кровотечения — главная причина отказа; возможны акне, головные боли. Введение/удаление — мелкая процедура.", sr: "Nepredvidiva krvarenja — glavni razlog za prekid; mogući akne, glavobolje. Postavljanje/uklanjanje — mala procedura." }, who: { en: "The most effective reversible method; perfect = typical. Good for those who want «fit and forget».", ru: "Самый эффективный обратимый метод; идеальное=типичное. Хорош тем, кто хочет «поставить и забыть».", sr: "Najefikasniji reverzibilni metod; idealno=tipično. Dobar za one koji žele „postavi i zaboravi“." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "steril_f", label: { en: "Female sterilization", ru: "Женская стерилизация", sr: "Ženska sterilizacija" }, perfect: 0.005, typical: 0.005, sev: 4, control: "toggle",
    side: { en: "Surgery and anesthesia; considered irreversible; small ectopic risk on failure.", ru: "Хирургия и наркоз; считается необратимой; малый риск внематочной при отказе.", sr: "Hirurgija i anestezija; smatra se nepovratnom; mali rizik od vanmaterične pri neuspehu." },
    guide: { how: { en: "Surgical blocking/removal of the fallopian tubes.", ru: "Хирургическое перекрытие/удаление маточных труб.", sr: "Hirurško zatvaranje/uklanjanje jajovoda." }, side: { en: "Surgical risks (anesthesia, bleeding, infection); on a rare failure a higher share of ectopic. Hormones unchanged.", ru: "Операционные риски (наркоз, кровотечение, инфекция); при редкой неудаче выше доля внематочной. Гормоны не меняются.", sr: "Hirurški rizici (anestezija, krvarenje, infekcija); pri retkom neuspehu veći udeo vanmaterične. Hormoni se ne menjaju." }, who: { en: "For those done with childbearing: the method is PERMANENT and irreversible. Weigh the decision in advance.", ru: "Для завершивших деторождение: метод ПОСТОЯННЫЙ и необратимый. Решение взвешивать заранее.", sr: "Za one koji su završili sa rađanjem: metod je TRAJAN i nepovratan. Odluku odvagati unapred." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "vasectomy", label: { en: "Vasectomy", ru: "Вазэктомия", sr: "Vazektomija" }, perfect: 0.001, typical: 0.0015, sev: 4, control: "toggle",
    side: { en: "Minor surgery; not effective immediately (needs sperm check); considered irreversible.", ru: "Малая операция; не сразу эффективна (нужен контроль спермы); считается необратимой.", sr: "Mala operacija; nije odmah efikasna (potrebna provera sperme); smatra se nepovratnom." },
    guide: { how: { en: "Cutting/tying the vas deferens — no sperm in the ejaculate.", ru: "Пересечение/перевязка семявыносящих протоков — в эякуляте нет сперматозоидов.", sr: "Presecanje/podvezivanje semenovoda — u ejakulatu nema spermatozoida." }, side: { en: "Minor surgery: pain, swelling, bruising, rarely chronic pain. The effect is not instant — a control sperm test is needed (~3 mo).", ru: "Малая операция: боль, отёк, синяк, редко хроническая боль. Эффект не мгновенный — нужен контрольный анализ спермы (~3 мес).", sr: "Mala operacija: bol, otok, modrica, retko hroničan bol. Efekat nije trenutan — potrebna kontrolna analiza sperme (~3 mes.)." }, who: { en: "A permanent method for men done with childbearing. Simpler than female sterilization, but just as irreversible.", ru: "Постоянный метод для мужчин, завершивших деторождение. Проще женской стерилизации, но столь же необратим.", sr: "Trajni metod za muškarce koji su završili sa rađanjem. Jednostavniji od ženske sterilizacije, ali jednako nepovratan." } },
    sources: [{ label: "CDC Appendix D", url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6304a5.htm" }] },
  { key: "lam", label: { en: "LAM (lactational amenorrhea)", ru: "LAM (лактационная аменорея)", sr: "LAM (laktaciona amenoreja)" }, perfect: 0.005, typical: 0.02, sev: 1, control: "toggle",
    side: { en: "Works only the first ~6 mo under strict conditions; «breaks» easily. (6-mo numbers — estimate.)", ru: "Работает лишь первые ~6 мес при строгих условиях; легко «ломается». (Числа за 6 мес — оценка.)", sr: "Radi samo prvih ~6 mes. pod strogim uslovima; lako se „pokvari“. (Brojevi za 6 mes. — procena.)" },
    guide: { how: { en: "Amenorrhea during exclusive breastfeeding suppresses ovulation. Only under all three conditions: baby <6 mo, no menstruation, exclusive breastfeeding.", ru: "Аменорея при исключительно грудном вскармливании подавляет овуляцию. Только при всех трёх условиях: ребёнку <6 мес, нет менструаций, кормление исключительно грудью.", sr: "Amenoreja pri isključivom dojenju potiskuje ovulaciju. Samo pod sva tri uslova: beba <6 mes., nema menstruacija, isključivo dojenje." }, side: { en: "No side effects; breaking any of the three conditions sharply lowers protection; after 6 mo or the first period it does not work.", ru: "Побочек нет; нарушение любого из трёх условий резко снижает защиту; после 6 мес или первой менструации не действует.", sr: "Nema neželjenih efekata; kršenje bilo kog od tri uslova naglo smanjuje zaštitu; posle 6 mes. ili prve menstruacije ne deluje." }, who: { en: "A temporary method for nursing mothers in the first half-year. Numbers are an estimate for 6 mo (Trussell/Cochrane), not a year.", ru: "Временный метод для кормящих в первые полгода. Числа — оценка за 6 мес (Trussell/Cochrane), не за год.", sr: "Privremeni metod za dojilje u prvih pola godine. Brojevi su procena za 6 mes. (Trussell/Cochrane), ne za godinu." } },
    sources: [{ label: "CDC", url: "https://www.cdc.gov/contraception/about/index.html" }, { label: "Cochrane", url: "https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD001329.pub2/full" }] },
  { key: "ec", label: { en: "Emergency contraception", ru: "Экстренная контрацепция", sr: "Hitna kontracepcija" }, oneOff: true, perfect: null, typical: null, sev: 2, control: "oneOff",
    side: { en: "Nausea, cycle disruption; more effective the sooner taken. One-off — not on the curve.", ru: "Тошнота, сбой цикла; тем эффективнее, чем раньше принята. Разовая — не на кривую.", sr: "Mučnina, poremećaj ciklusa; efikasnija što se ranije uzme. Jednokratna — nije na krivi." },
    guide: { how: { en: "A single dose after unprotected sex: levonorgestrel (up to 72 h) or ulipristal (up to 120 h) shifts ovulation; a copper IUD within 5 days is the most effective option.", ru: "Разовый приём после незащищённого акта: левоноргестрел (до 72 ч) или улипристал (до 120 ч) сдвигает овуляцию; медная ВМС в течение 5 дней — самый эффективный вариант.", sr: "Jednokratna doza posle nezaštićenog akta: levonorgestrel (do 72 h) ili ulipristal (do 120 h) pomera ovulaciju; bakarna spirala u roku od 5 dana — najefikasnija opcija." }, side: { en: "Nausea, headache, breast tenderness, temporary cycle disruption. Does not terminate an established pregnancy and does not protect during subsequent acts.", ru: "Тошнота, головная боль, болезненность груди, временный сбой цикла. Не прерывает наступившую беременность и не защищает при последующих актах.", sr: "Mučnina, glavobolja, osetljivost grudi, privremeni poremećaj ciklusa. Ne prekida nastalu trudnoću i ne štiti pri narednim aktima." }, who: { en: "A backup method «just in case», not for regular use. The sooner — the more effective. Levonorgestrel is less effective at high body weight.", ru: "Резервный метод «на случай», не для регулярного использования. Чем раньше — тем эффективнее. Левоноргестрел менее эффективен при высоком весе.", sr: "Rezervni metod „za svaki slučaj“, ne za redovnu upotrebu. Što ranije — to efikasnije. Levonorgestrel je manje efikasan pri visokoj telesnoj težini." } },
    sources: [{ label: "CDC", url: "https://www.cdc.gov/contraception/about/index.html" }] },
];
const CONTRA_MAP = Object.fromEntries(CONTRA.map((m) => [m.key, m]));
const methodFactors = (keys) => keys.filter((k) => k && k !== "none").reduce((f, k) => { const m = CONTRA_MAP[k]; return m ? f * (m.typical / 0.85) : f; }, 1);
function Qnat(age, perWeek) { const fc = fAge(age) * kFreq(perWeek); return 1 - Math.pow(1 - fc, 12); }
// Множитель контрацепции для «Девушки»: toggle (вкл/выкл) и perAct (доля актов u).
const womanFactor = (meth) => {
  let f = 1;
  CONTRA.forEach((m) => {
    if (m.key === "none" || m.oneOff) return;
    if (m.control === "toggle") { if (meth[m.key]) f *= (m.typical / 0.85); }
    else { const u = Math.max(0, Math.min(1, (meth[m.key] || 0) / 100)); if (u > 0) f *= ((1 - u) + u * (m.typical / 0.85)); }
  });
  return f;
};
const pregCumWomanF = (age, perWeek, factor, months) => 1 - Math.pow(1 - Math.min(0.999, Qnat(age, perWeek) * factor), months / 12);
// Парень: «хотя бы одна беременность среди партнёрш» — перемножаем вклады типов (ЗППП-логика).
function pregSurvivalMan(cfg, months, mFactor = 1) {
  let S = 1;
  TYPES.forEach((meta) => {
    const t = cfg[meta.key]; const cnt = t.count; if (cnt <= 0) return;
    const factors = womanFactor(t.meth) * mFactor;
    if (meta.kind === "oneoff") {
      const pa = Math.min(0.9, fAge(t.age) * 0.2 * factors);
      S *= Math.pow(Math.pow(1 - pa, cnt), months / 12);
    } else if (meta.kind === "ongoing") {
      const a = Math.min(0.999, Qnat(t.age, t.perWeek) * factors);
      const pPartner = 1 - Math.pow(1 - a, months / 12);
      S *= Math.pow(1 - pPartner, cnt);
    } else {
      const a = Math.min(0.999, Qnat(t.age, t.perWeek) * factors);
      const pRel = 1 - Math.pow(1 - a, Math.max(1, t.dur) / 12);
      S *= Math.pow(Math.pow(1 - pRel, cnt), months / 12);
    }
  });
  return S;
}
const PREG_BASE = {
  steady: { count: 1, perWeek: 3, dur: 0, age: 26, meth: { condom_m: 100 } },
  casual: { count: 2, perWeek: 1, dur: 12, age: 26, meth: { condom_m: 100 } },
  hookup: { count: 3, perWeek: 0, dur: 0, age: 26, meth: { condom_m: 100 } },
};
// Возраст мужчины — слабый фактор фертильности (заметнее после ~45). ОЦЕНКА.
function mAge(age) {
  if (age <= 40) return 1;
  if (age <= 55) return 1 - (age - 40) * 0.012;
  return Math.max(0.5, 0.82 - (age - 55) * 0.0073);
}
const PREG_PRESETS = [
  { key: "single", label: { en: "No partners", ru: "Без партнёрш", sr: "Bez partnerki" } },
  { key: "mono", label: { en: "Monogamy", ru: "Моногамия", sr: "Monogamija" }, steady: { count: 1, perWeek: 3, age: 26 } },
  { key: "dating", label: { en: "Dating", ru: "Встречается", sr: "Zabavlja se" }, casual: { count: 2, perWeek: 1, dur: 12, age: 26 } },
  { key: "active", label: { en: "Active dating", ru: "Активные знакомства", sr: "Aktivna upoznavanja" }, casual: { count: 4, perWeek: 1, dur: 3, age: 26 }, hookup: { count: 6, age: 26 } },
  { key: "hookups", label: { en: "Hookups", ru: "Хукапы", sr: "Avanture" }, hookup: { count: 15, age: 26 } },
];
const mkPregCfg = (over = {}) => ({
  steady: { ...PREG_BASE.steady, ...(over.steady || { count: 0 }) },
  casual: { ...PREG_BASE.casual, ...(over.casual || { count: 0 }) },
  hookup: { ...PREG_BASE.hookup, ...(over.hookup || { count: 0 }) },
});

function PregTip({ active, payload, label, lang }) {
  if (!active || !payload?.length) return null;
  const yrs = Math.floor(label / 12), mos = label % 12;
  return (
    <div style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 12 }}>
      <div style={{ color: C.mid, marginBottom: 6 }}>{yrs > 0 ? yrs + " " + yrShort(lang) + " " : ""}{mos} {moWord(lang)}</div>
      {payload.map((e) => (<div key={e.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 18, color: C.hi }}><span><span style={{ color: e.stroke }}>●</span> {e.name}</span><span>{pctVal(e.value, lang)}</span></div>))}
    </div>
  );
}
function PregChartPanel({ data, lines, years, setYears, yMax, setYMax, headline, lang, L }) {
  const horizonM = years * 12;
  const ts = years <= 12 ? 1 : years <= 30 ? 5 : 10;
  const ticks = []; for (let y = 0; y <= years; y += ts) ticks.push(y * 12);
  return (
    <div className="studio-chart" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 16px 12px" }}>
      <div style={{ display: "flex", gap: 26, flexWrap: "wrap", marginBottom: 16 }}>
        <Slider label={L.horizon} value={years} set={setYears} min={1} max={50} step={1} valueText={`${years} ${yearsWord(years, lang)}`} hint={L.horizonHint} labelH={36} />
        <Slider label={L.scale} value={yMax} set={setYMax} min={1} max={100} step={1} valueText={`${lang === "en" ? "to" : lang === "sr" ? "do" : "до"} ${yMax}%`} hint={L.scaleHint} labelH={36} />
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
        {lines.map((ln) => (<span key={ln.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.mid }}><span style={{ width: 14, height: 0, borderTop: `3px ${ln.dash ? "dashed" : "solid"} ${ln.color}`, display: "inline-block" }} />{ln.label}</span>))}
      </div>
      <div className="chartbox">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="t" type="number" domain={[0, horizonM]} ticks={ticks} interval={0} stroke={C.dim} tick={{ fontSize: 12, fill: C.dim }} tickFormatter={(t) => (t === 0 ? "0" : `${t / 12}${L.yrAxis}`)} />
            <YAxis domain={[0, yMax]} allowDataOverflow stroke={C.dim} tick={{ fontSize: 12, fill: C.dim }} tickFormatter={(v) => `${v}%`} width={46} />
            <Tooltip content={(p) => <PregTip {...p} lang={lang} />} />
            {lines.map((ln) => (<Line key={ln.key} type="monotone" dataKey={ln.key} name={ln.label} stroke={ln.color} strokeWidth={ln.dash ? 1.6 : 2.4} strokeDasharray={ln.dash ? "6 4" : "0"} dot={false} isAnimationActive={false} />))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {headline && <div style={{ color: C.mid, fontSize: 13, marginTop: 8 }}>{headline}</div>}
    </div>
  );
}
function PregTypeCard({ meta, t, setT, lang, L }) {
  const col = meta.color; const floatCount = meta.kind !== "ongoing"; const cnt = floatCount ? Math.round(t.count * 10) / 10 : Math.round(t.count);
  if (t.count <= 0) {
    return (
      <button onClick={() => setT({ count: meta.addCount })} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", background: "transparent", border: `1px dashed ${C.border}`, borderLeft: `3px solid ${col}77`, borderRadius: 10, padding: "11px 14px", cursor: "pointer" }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: col, opacity: 0.55 }} />
        <span style={{ color: C.mid, fontSize: 13.5 }}>{meta.label[lang]}</span>
        <span style={{ marginLeft: "auto", color: col, fontSize: 12.5, fontWeight: 600 }}>{L.addBtn}</span>
      </button>
    );
  }
  const cap = meta.kind === "oneoff" ? L.pregOneoffCap : meta.kind === "ongoing" ? L.pregOngoingCap : L.pregRelCap(fmtDur(t.dur, lang));
  return (
    <div style={{ background: C.panel, border: `1px solid ${col}55`, borderLeft: `3px solid ${col}`, borderRadius: 12, padding: "13px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: col }} />
        <span style={{ color: C.hi, fontSize: 14, fontWeight: 600 }}>{meta.label[lang]}</span>
        <span style={{ color: C.dim, fontSize: 11, marginLeft: "auto" }}>{cap}</span>
        <button onClick={() => setT({ count: 0 })} title={L.removeCard} aria-label={L.removeCard} onMouseEnter={(e) => (e.currentTarget.style.color = C.hi)} onMouseLeave={(e) => (e.currentTarget.style.color = C.dim)} style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontSize: 17, lineHeight: 1, padding: "0 2px", marginLeft: 6 }}>×</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <Slider label={meta.countLab[lang]} value={t.count} set={(v) => setT({ count: floatCount ? Math.round(v * 10) / 10 : Math.round(v) })} min={0} max={meta.countMax} step={floatCount ? 0.1 : 1} valueText={floatCount ? dec(cnt.toString(), lang) : `${cnt}`} />
        <Slider label={L.pregPartnerAge} value={t.age} set={(v) => setT({ age: Math.round(v) })} min={16} max={99} step={1} valueText={`${Math.round(t.age)}`} info={L.pregPartnerAgeInfo} />
        {meta.kind !== "oneoff" && <Slider label={L.sexPerWeek} value={t.perWeek} set={(v) => setT({ perWeek: Math.round(v * 10) / 10 })} min={0.1} max={14} step={0.1} valueText={`${dec(t.perWeek.toFixed(1), lang)}×`} />}
        {meta.kind === "recurring" && <Slider label={L.relDuration} value={t.dur} set={(v) => setT({ dur: v })} min={1} max={60} step={1} valueText={fmtDur(t.dur, lang)} />}
        <WomanMethods meth={t.meth} setMeth={(fn) => setT({ meth: fn(t.meth) })} lang={lang} L={L} />
      </div>
    </div>
  );
}
function WomanMethods({ meth, setMeth, lang, L }) {
  const usable = CONTRA.filter((m) => m.key !== "none" && !m.oneOff);
  const added = usable.filter((m) => m.key in meth);
  const avail = usable.filter((m) => !(m.key in meth));
  const add = (k) => { const m = CONTRA_MAP[k]; setMeth((s) => ({ ...s, [k]: m.control === "perAct" ? 100 : true })); };
  const rm = (k) => setMeth((s) => { const n = { ...s }; delete n[k]; return n; });
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div>
      <div style={{ color: C.mid, fontSize: 13, marginBottom: 8, display: "inline-flex", alignItems: "center" }}>{L.contraLabel}<Info text={L.contraInfo} /></div>
      {added.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
          {added.map((m) => (
            <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 8, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 10px" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: SEV[m.sev], flex: "0 0 8px" }} title={L.sevTitle} />
              <span style={{ color: C.hi, fontSize: 13 }}>{m.label[lang]}</span>
              {m.control === "perAct" && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", minWidth: 118 }} title={L.shareOfActs}>
                  <input className="rng" type="range" min={0} max={100} step={5} value={meth[m.key] || 0} onChange={(e) => setMeth((s) => ({ ...s, [m.key]: parseFloat(e.target.value) }))} />
                  <span className="num" style={{ color: C.accent, fontSize: 12, width: 34, textAlign: "right" }}>{meth[m.key] || 0}%</span>
                </div>
              )}
              <button onClick={() => rm(m.key)} title={L.removeMethod} style={{ marginLeft: m.control === "perAct" ? 4 : "auto", background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontSize: 17, lineHeight: 1, padding: "0 2px" }}>×</button>
            </div>
          ))}
        </div>
      )}
      <div ref={ref} style={{ position: "relative" }}>
        <button onClick={() => setOpen((o) => !o)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: C.panel2, color: C.accent, border: `1px dashed ${C.accent}66`, borderRadius: 8, padding: "9px 12px", fontSize: 13, cursor: "pointer" }}>
          <span>{L.addMethod}</span>
          <span style={{ color: C.dim, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
        </button>
        {open && (
          <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 30, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, boxShadow: "0 10px 28px rgba(0,0,0,.5)", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {avail.map((m) => <button key={m.key} onClick={() => add(m.key)} className="pill">{m.label[lang]}</button>)}
            {avail.length === 0 && <span style={{ color: C.dim, fontSize: 12 }}>{L.allMethodsAdded}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// Разрыв «идеальное/реальное» по каждому методу — локализован.
const GAP = {
  withdrawal: { en: "The gap is huge: it's hard to always pull out in time, and pre-ejaculate may contain sperm.", ru: "Разрыв огромный: трудно всегда успеть вывести вовремя, а предэякулят может содержать сперматозоиды.", sr: "Jaz je ogroman: teško je uvek izvući na vreme, a predejakulat može sadržati spermatozoide." },
  fam: { en: "The biggest gap: easy to misjudge fertile days or not resist sex in the risky window.", ru: "Самый большой разрыв: легко ошибиться в определении фертильных дней или не удержаться от секса в опасное окно.", sr: "Najveći jaz: lako je pogrešiti u određivanju plodnih dana ili ne odoleti seksu u opasnom prozoru." },
  condom_m: { en: "Tears, slips, put on late, or not used every act.", ru: "Рвётся, слетает, надевается с опозданием или используется не на каждый акт.", sr: "Puca, sklizne, stavlja se sa zakašnjenjem ili se ne koristi pri svakom aktu." },
  condom_f: { en: "Shifts, inserted wrong, or not used every time.", ru: "Смещается, вводится неправильно или используется не каждый раз.", sr: "Pomera se, uvodi se pogrešno ili se ne koristi svaki put." },
  diaphragm: { en: "Wrong placement, shifting, no spermicide, or not every act.", ru: "Неправильная установка, смещение, без спермицида или не на каждый акт.", sr: "Pogrešno postavljanje, pomeranje, bez spermicida ili ne pri svakom aktu." },
  spermicide: { en: "Not always applied in advance and correctly; even ideally the method is weak.", ru: "Применяют не всегда заранее и правильно; даже идеально метод слабый.", sr: "Ne nanosi se uvek unapred i pravilno; čak i idealno metod je slab." },
  cok: { en: "The main cause of the gap — missed and late daily pills.", ru: "Главная причина разрыва — пропуски и опоздания в ежедневном приёме таблеток.", sr: "Glavni uzrok jaza — propusti i kašnjenja u dnevnom uzimanju pilula." },
  minipill: { en: "Very sensitive to dosing time — even a small delay lowers protection.", ru: "Очень чувствительны ко времени приёма — даже небольшое опоздание снижает защиту.", sr: "Veoma osetljive na vreme uzimanja — čak i malo kašnjenje smanjuje zaštitu." },
  patch: { en: "Forgetting to change the patch on time or it peeling off.", ru: "Забывают вовремя поменять пластырь или он отклеивается.", sr: "Zaboravljaju da promene flaster na vreme ili se odlepi." },
  ring: { en: "Forgetting to insert or replace the ring on time.", ru: "Забывают вовремя поставить или сменить кольцо.", sr: "Zaboravljaju da postave ili promene prsten na vreme." },
  depo: { en: "Missing the next injection deadline (needed every ~3 months).", ru: "Пропускают срок очередной инъекции (нужна каждые ~3 месяца).", sr: "Propuštaju rok sledeće injekcije (potrebna svaka ~3 meseca)." },
  iud_cu: { en: "Almost no difference — the method does not depend on the user («fit and forget»).", ru: "Почти нет разницы — метод не зависит от пользователя («поставил и забыл»).", sr: "Skoro nema razlike — metod ne zavisi od korisnika („postavi i zaboravi“)." },
  iud_lng: { en: "No difference — the method does not depend on the user.", ru: "Разницы нет — метод не зависит от пользователя.", sr: "Nema razlike — metod ne zavisi od korisnika." },
  implant: { en: "No difference — the method does not depend on the user.", ru: "Разницы нет — метод не зависит от пользователя.", sr: "Nema razlike — metod ne zavisi od korisnika." },
  steril_f: { en: "Almost no difference — a permanent method, user error is impossible.", ru: "Разницы практически нет — постоянный метод, ошибка пользователя невозможна.", sr: "Praktično nema razlike — trajan metod, korisnička greška je nemoguća." },
  vasectomy: { en: "Almost no difference; the only risk is sex before the control sperm test (~3 mo).", ru: "Почти нет разницы; единственный риск — секс до контрольного анализа спермы (~3 мес).", sr: "Skoro nema razlike; jedini rizik je seks pre kontrolne analize sperme (~3 mes.)." },
  lam: { en: "The gap comes from breaking the strict conditions: feeding regimen, baby under 6 mo, no menstruation.", ru: "Разрыв из-за нарушения строгих условий: режим кормления, возраст ребёнка до 6 мес, отсутствие менструаций.", sr: "Jaz zbog kršenja strogih uslova: režim dojenja, uzrast bebe do 6 mes., odsustvo menstruacija." },
  ec: { en: "A one-off remedy — there is no annual figure. Effectiveness depends on how quickly it's taken after the act.", ru: "Разовое средство — годового показателя нет. Эффективность зависит от того, насколько быстро принять после акта.", sr: "Jednokratno sredstvo — godišnjeg pokazatelja nema. Efikasnost zavisi od toga koliko brzo se uzme posle akta." },
};

function ContraTable({ lang, L }) {
  const [open, setOpen] = useState({});
  const fmtP = (v) => (v == null ? "—" : pctAct(v, lang));
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "6px 6px", margin: "14px 0" }}>
      <div style={{ padding: "12px 12px 6px", fontSize: 13, color: C.hi, fontWeight: 600 }}>{L.contraTableTitle}{L.contraTableSub && <span style={{ color: C.dim, fontWeight: 400, fontSize: 12 }}> {L.contraTableSub}</span>}</div>
      <div className="tbl-wrap">
        <table className="inf">
          <thead><tr>
            <th>{L.thMethod}</th>
            <th><span style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>{L.thPerfect}</span><div style={{ fontWeight: 400, color: C.dim, fontSize: 10, textTransform: "none", letterSpacing: 0, marginTop: 3 }}>{L.pregPerYear}</div></th>
            <th><span style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>{L.thTypical}<Info dn text={L.typicalInfo} /></span><div style={{ fontWeight: 400, color: C.dim, fontSize: 10, textTransform: "none", letterSpacing: 0, marginTop: 3 }}>{L.pregPerYear}</div></th>
            <th>{L.thSideFx}</th>
          </tr></thead>
          <tbody>
            {CONTRA.filter((m) => m.key !== "none").flatMap((m) => {
              const exp = !!open[m.key];
              const rows = [
                <tr key={m.key} className={"inf-row" + (exp ? " on" : "")} onClick={() => setOpen((o) => ({ ...o, [m.key]: !o[m.key] }))} title={exp ? L.collapseGuide : L.openGuide} style={{ borderLeft: `3px solid ${SEV[m.sev]}` }}>
                  <td style={{ whiteSpace: "nowrap", color: C.hi }}>{m.label[lang]}<span aria-hidden style={{ marginLeft: 8, color: exp ? PREG : C.dim, fontSize: 10 }}>{exp ? "▾" : "▸"}</span></td>
                  <td className="num">{fmtP(m.perfect)}</td>
                  <td className="num" style={{ whiteSpace: "nowrap" }}>{fmtP(m.typical)}{GAP[m.key] && <Info dn text={GAP[m.key][lang]} />}</td>
                  <td><span style={{ background: `${SEV[m.sev]}22`, color: SEV[m.sev], padding: "3px 8px", borderRadius: 6, fontSize: 12, fontWeight: 500, display: "inline-block" }}>{m.side[lang]}</span></td>
                </tr>,
              ];
              if (exp) rows.push(
                <tr key={m.key + "-g"} style={{ borderLeft: `3px solid ${SEV[m.sev]}` }}>
                  <td colSpan={4} style={{ background: C.panel2, padding: "14px 16px" }}>
                    <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                      <div><div className="ghd">{L.howWorks}</div><div className="gtx">{m.guide.how[lang]}</div></div>
                      <div><div className="ghd">{L.sideRisks}</div><div className="gtx">{m.guide.side[lang]}</div></div>
                      <div><div className="ghd">{L.whoFor}</div><div className="gtx">{m.guide.who[lang]}</div></div>
                    </div>
                    <div style={{ marginTop: 12, fontSize: 12, color: C.dim }}>{L.sourcesLab}: {m.sources.map((s, i) => (<span key={i}>{i > 0 ? " · " : ""}<a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: PREG, textDecoration: "none" }}>{s.label} ↗</a></span>))} {L.contraSourcesTail}</div>
                  </td>
                </tr>
              );
              return rows;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Pregnancy({ who, setWho, years, setYears, yMax, setYMax, lang, L, w, setW, meth, setMeth, mcfg, setMcfg, manAge, setManAge, activePreg, setActivePreg }) {
  const months = years * 12;
  const setMType = (key, patch) => { setMcfg((c) => ({ ...c, [key]: { ...c[key], ...patch } })); setActivePreg(null); };
  const applyPreg = (pr) => { setMcfg(mkPregCfg(pr)); setActivePreg(pr.key); };
  const mFac = mAge(manAge);
  const yw = yearsWord(years, lang);

  const wFac = womanFactor(meth);
  const wData = useMemo(() => {
    const pts = []; const step = Math.max(1, Math.ceil(months / 170));
    for (let t = 0; t <= months; t += step) pts.push({ t, p: pregCumWomanF(w.age, w.perWeek, wFac, t) * 100, ref: pregCumWomanF(w.age, w.perWeek, 1, t) * 100 });
    return pts;
  }, [w, meth, months]); // eslint-disable-line react-hooks/exhaustive-deps
  const wEnd = pregCumWomanF(w.age, w.perWeek, wFac, months) * 100;

  const refCfg = useMemo(() => ({ steady: { ...mcfg.steady, meth: {} }, casual: { ...mcfg.casual, meth: {} }, hookup: { ...mcfg.hookup, meth: {} } }), [mcfg]);
  const mData = useMemo(() => {
    const pts = []; const step = Math.max(1, Math.ceil(months / 170));
    for (let t = 0; t <= months; t += step) pts.push({ t, p: (1 - pregSurvivalMan(mcfg, t, mFac)) * 100, ref: (1 - pregSurvivalMan(refCfg, t, mFac)) * 100 });
    return pts;
  }, [mcfg, refCfg, months, mFac]);
  const mEnd = (1 - pregSurvivalMan(mcfg, months, mFac)) * 100;
  const mBuilt = useMemo(() => buildPartnersTyped(mcfg, months), [mcfg, months]);
  const mPacked = useMemo(() => packLanes(mBuilt.list), [mBuilt]);
  const mAvg = mcfg.steady.count * mcfg.steady.perWeek + mcfg.casual.count * mcfg.casual.dur / 12 * mcfg.casual.perWeek + mcfg.hookup.count / 52;

  return (
    <>
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 18px", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setWho("woman")} style={SUBSEG(who === "woman", PREG)}>{L.pregWoman}</button>
          <button onClick={() => setWho("man")} style={SUBSEG(who === "man", "#4dabf7")}>{L.pregMan}</button>
        </div>
        <div className="rich" style={{ fontSize: 12.5, color: C.mid, lineHeight: 1.55, marginTop: 12 }}>{who === "woman" ? L.pregWomanExpl : L.pregManExpl}</div>
      </div>

      {who === "woman" ? (
        <div className="studio">
          <div className="studio-controls">
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 15 }}>
              <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 0.6 }}>{L.pregProfile}</div>
              <Slider label={L.pregWomanAge} value={w.age} set={(v) => setW((s) => ({ ...s, age: Math.round(v) }))} min={16} max={99} step={1} valueText={`${w.age}`} info={L.pregWomanAgeInfo} />
              <Slider label={L.sexPerWeek} value={w.perWeek} set={(v) => setW((s) => ({ ...s, perWeek: Math.round(v * 10) / 10 }))} min={0.1} max={14} step={0.1} valueText={`${dec(w.perWeek.toFixed(1), lang)}×`} info={L.pregFreqInfo} />
              <WomanMethods meth={meth} setMeth={setMeth} lang={lang} L={L} />
            </div>
          </div>
          <PregChartPanel data={wData} lines={[{ key: "p", label: L.pregLineWoman, color: PREG }, { key: "ref", label: L.pregLineNoContra, color: C.dim, dash: true }]} years={years} setYears={setYears} yMax={yMax} setYMax={setYMax} lang={lang} L={L} headline={L.pregHeadWoman(years, yw, pctVal(wEnd, lang), wFac < 1)} />
        </div>
      ) : (
        <>
        <div className="studio">
          <div className="studio-controls">
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.6 }}>{L.pregBehaviorPreset}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {PREG_PRESETS.map((pr) => (<button key={pr.key} onClick={() => applyPreg(pr)} className={"pill " + (activePreg === pr.key ? "on" : "")}>{pr.label[lang]}</button>))}
              </div>
            </div>
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 18px", marginBottom: 14 }}>
              <Slider label={L.pregMyAge} value={manAge} set={setManAge} min={16} max={99} step={1} valueText={`${manAge}`} info={L.pregMyAgeInfo} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {TYPES.map((meta) => (<PregTypeCard key={meta.key} meta={meta} t={mcfg[meta.key]} setT={(patch) => setMType(meta.key, patch)} lang={lang} L={L} />))}
            </div>
          </div>
          <PregChartPanel data={mData} lines={[{ key: "p", label: L.pregLineMan, color: PREG }, { key: "ref", label: L.pregLineIfNoContra, color: C.dim, dash: true }]} years={years} setYears={setYears} yMax={yMax} setYMax={setYMax} lang={lang} L={L} headline={L.pregHeadMan(years, yw, pctVal(mEnd, lang))} />
        </div>
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 18px 14px", margin: "14px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{L.structTitle}</h2>
            <div className="rich" style={{ fontSize: 12, color: C.mid }}>{L.structStats(dec(mAvg.toFixed(1), lang), mPacked.lanes, mBuilt.total)}</div>
          </div>
          <p style={{ color: C.dim, fontSize: 12, margin: "0 0 14px", lineHeight: 1.5 }}>
            <span style={{ color: "#f0a500" }}>● {L.legSteady}</span> · <span style={{ color: "#2ec4b6" }}>● {L.legCasual}</span> · <span style={{ color: "#4dabf7" }}>● {L.legHookup}</span>{L.structLegendTail}
          </p>
          {mPacked.list.length === 0 ? <div style={{ color: C.mid, fontSize: 13, padding: "20px 0", textAlign: "center" }}>{L.pregNoPartnersF}</div> : <><Timeline packed={mPacked} horizonM={months} years={years} lang={lang} />{mBuilt.total > mPacked.list.length && <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>{L.shownPart(mBuilt.total)}</div>}</>}
        </div>
        </>
      )}

      <ContraTable lang={lang} L={L} />

      <details style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, margin: "14px 0" }}>
        <summary style={{ color: C.hi, fontSize: 15, fontWeight: 600 }}>{L.pregAssumTitle}</summary>
        <div className="rich" style={{ color: C.mid, fontSize: 13, lineHeight: 1.6, marginTop: 14 }}>
          {[L.pregAssum1, L.pregAssum2, L.pregAssum4, L.pregAssum5, L.pregAssum6].map((a, i) => (
            <div key={i} style={{ borderLeft: `2px solid ${C.border}`, paddingLeft: 12, marginBottom: 13 }}>{a}</div>
          ))}
          <div style={{ fontSize: 12, color: C.dim }}>{L.pregAssumSources}</div>
        </div>
      </details>
    </>
  );
}

function LangSwitch({ lang, setLang }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "absolute", top: 0, right: 0, zIndex: 50 }}>
      <button onClick={() => setOpen((o) => !o)} aria-label="Language" style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", color: C.mid, border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 7px", fontSize: 11.5, cursor: "pointer", opacity: 0.8 }}>
        <span aria-hidden style={{ fontSize: 11 }}>🌐</span>{lang.toUpperCase()}
        <span aria-hidden style={{ color: C.dim, fontSize: 9, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 8, boxShadow: "0 10px 28px rgba(0,0,0,.5)", display: "flex", gap: 6 }}>
          {LANGS.map((lg) => (
            <button key={lg} onClick={() => { setLang(lg); setOpen(false); }} style={{ background: lang === lg ? C.accent : "transparent", color: lang === lg ? C.bg : C.mid, border: `1px solid ${lang === lg ? C.accent : C.border}`, borderRadius: 999, padding: "5px 12px", fontSize: 13, fontWeight: lang === lg ? 600 : 500, cursor: "pointer" }}>{lg.toUpperCase()}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// --- «Поделиться»: КОМПАКТНАЯ сериализация состояния ⇄ ссылка (хэш #c=base64url) ---
// Короткие ключи + пропуск дефолтов + битовые маски + индекс пресета вместо полного cfg.
// Hash работает на любом подпути GitHub Pages без перезагрузки. Старый формат v:1 принимается как есть.
const SHARE_TKEYS = ["steady", "casual", "hookup"];
const STI_KEYS = STIS.map((s) => s.key);
const PRESET_KEYS = PRESETS.map((p) => p.key);
const PREG_PRESET_KEYS = PREG_PRESETS.map((p) => p.key);
const STI_FIELDS = ["count", "condom", "perWeek", "dur", "tested"]; // poolMul — производное, не сериализуем
const PREG_FIELDS = ["count", "perWeek", "dur", "age"];             // + meth отдельным слотом
const actsToMask = (a) => ACT_KEYS.reduce((m, k, i) => m | (a && a[k] ? 1 << i : 0), 0);
const maskToActs = (m) => { const o = {}; ACT_KEYS.forEach((k, i) => { o[k] = !!(m & (1 << i)); }); return o; };
const DEF_ACTS_MASK = actsToMask({ vagR: true, oralR: true, oralI: true });
const hiddenToMask = (h) => STI_KEYS.reduce((m, k, i) => m | (h && h[k] ? 1 << i : 0), 0);
const maskToHidden = (m) => { const o = {}; STI_KEYS.forEach((k, i) => { if (m & (1 << i)) o[k] = true; }); return o; };
const isDefMeth = (m) => !!m && Object.keys(m).length === 1 && m.condom_m === 100;
const packStiCfg = (cfg) => SHARE_TKEYS.map((k) => (cfg[k].count > 0 ? STI_FIELDS.map((f) => cfg[k][f]) : 0));
const unpackStiCfg = (arr) => {
  const c = mkCfg(); // все count 0, остальное из BASE (incl. poolMul)
  (arr || []).forEach((a, i) => { if (Array.isArray(a)) STI_FIELDS.forEach((f, j) => (c[SHARE_TKEYS[i]][f] = a[j])); });
  return c;
};
const packPregCfg = (cfg) => SHARE_TKEYS.map((k) => { const t = cfg[k]; return t.count > 0 ? [...PREG_FIELDS.map((f) => t[f]), isDefMeth(t.meth) ? 0 : t.meth] : 0; });
const unpackPregCfg = (arr) => {
  const c = mkPregCfg();
  (arr || []).forEach((a, i) => { if (Array.isArray(a)) { const t = c[SHARE_TKEYS[i]]; PREG_FIELDS.forEach((f, j) => (t[f] = a[j])); t.meth = a[4] ? a[4] : { condom_m: 100 }; } });
  return c;
};

function buildShare(s) {
  const o = { v: 2 };
  if (s.lang !== "en") o.l = s.lang;
  if (s.mode !== "sti") o.m = 1;
  if (s.who !== "woman") o.g = 1;
  if (s.years !== 10) o.y = s.years;
  if (s.yMax !== 100) o.ym = s.yMax;
  // ЗППП: «open» — дефолт (опускаем); другой пресет → индекс; кастом → компактный cfg.
  // Любая ручная правка обнуляет activePreset, поэтому при наличии пресета cfg всегда = mkCfg(preset).
  if (s.preset === "open") { /* дефолт */ }
  else if (s.preset && PRESET_KEYS.indexOf(s.preset) >= 0) o.ps = PRESET_KEYS.indexOf(s.preset);
  else o.c = packStiCfg(s.cfg);
  const am = actsToMask(s.acts); if (am !== DEF_ACTS_MASK) o.a = am;
  const hm = hiddenToMask(s.hidden); if (hm) o.h = hm;
  if (s.vaxHpv) o.vh = 1;
  if (s.vaxHbv) o.vb = 1;
  if (s.selected !== "chl" && STI_KEYS.indexOf(s.selected) >= 0) o.s = STI_KEYS.indexOf(s.selected);
  if (s.env && s.env !== "normal") o.e = s.env === "high" ? 1 : 2;
  // Беременность — девушка
  if (s.w && s.w.age !== 26) o.wa = s.w.age;
  if (s.w && s.w.perWeek !== 3) o.wf = s.w.perWeek;
  if (!isDefMeth(s.meth)) o.wm = s.meth;
  // Беременность — парень: «dating» — дефолт (опускаем)
  if (s.preg === "dating") { /* дефолт */ }
  else if (s.preg && PREG_PRESET_KEYS.indexOf(s.preg) >= 0) o.pp = PREG_PRESET_KEYS.indexOf(s.preg);
  else o.mc = packPregCfg(s.mcfg);
  if (s.manAge !== 28) o.ma = s.manAge;
  return o;
}

function parseShare(o) {
  if (!o || typeof o !== "object") return null;
  if (o.v === 1) return o; // старый полный формат — уже в форме SHARE_INIT
  if (o.v !== 2) return null;
  const r = { lang: o.l || "en", mode: o.m ? "preg" : "sti", who: o.g ? "man" : "woman",
    years: o.y ?? 10, yMax: o.ym ?? 100, preset: "open", preg: "dating" };
  if (typeof o.ps === "number" && PRESETS[o.ps]) { r.preset = PRESET_KEYS[o.ps]; r.cfg = mkCfg(PRESETS[o.ps]); }
  else if (o.c) { r.preset = null; r.cfg = unpackStiCfg(o.c); }
  if (typeof o.a === "number") r.acts = maskToActs(o.a);
  if (o.h) r.hidden = maskToHidden(o.h);
  if (o.vh) r.vaxHpv = true;
  if (o.vb) r.vaxHbv = true;
  if (typeof o.s === "number" && STI_KEYS[o.s]) r.selected = STI_KEYS[o.s];
  if (o.e === 1) r.env = "high"; else if (o.e === 2) r.env = "outbreak";
  if (typeof o.wa === "number" || typeof o.wf === "number") r.w = { age: o.wa ?? 26, perWeek: o.wf ?? 3 };
  if (o.wm) r.meth = o.wm;
  if (typeof o.pp === "number" && PREG_PRESETS[o.pp]) { r.preg = PREG_PRESET_KEYS[o.pp]; r.mcfg = mkPregCfg(PREG_PRESETS[o.pp]); }
  else if (o.mc) { r.preg = null; r.mcfg = unpackPregCfg(o.mc); }
  if (typeof o.ma === "number") r.manAge = o.ma;
  return r;
}

function encodeShare(snap) {
  try { return btoa(unescape(encodeURIComponent(JSON.stringify(buildShare(snap))))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  catch { return ""; }
}
function decodeShare() {
  try {
    const h = (typeof window !== "undefined" ? window.location.hash : "") || "";
    const m = h.match(/[#&]c=([^&]+)/);
    if (!m) return null;
    let b = m[1].replace(/-/g, "+").replace(/_/g, "/"); while (b.length % 4) b += "=";
    return parseShare(JSON.parse(decodeURIComponent(escape(atob(b)))));
  } catch { return null; }
}
// Накладываем сохранённый конфиг поверх дефолта по каждому типу партнёров (устойчиво к нехватке полей).
const mergeTypes = (base, over) => over ? {
  steady: { ...base.steady, ...(over.steady || {}) },
  casual: { ...base.casual, ...(over.casual || {}) },
  hookup: { ...base.hookup, ...(over.hookup || {}) },
} : base;
const SHARE_INIT = decodeShare();

// Кнопка «Поделиться»: копирует ссылку с текущими настройками в буфер, с явным визуальным фидбеком.
function ShareButton({ snapshot, L }) {
  const [copied, setCopied] = useState(false);
  const tRef = useRef(null);
  useEffect(() => () => clearTimeout(tRef.current), []);
  const copy = async () => {
    const url = window.location.href.split("#")[0] + "#c=" + encodeShare(snapshot());
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch {}
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = url; ta.style.position = "fixed"; ta.style.left = "-9999px";
        document.body.appendChild(ta); ta.select(); ok = document.execCommand("copy"); document.body.removeChild(ta);
      } catch {}
    }
    try { window.history.replaceState(null, "", url); } catch {} // и сама страница становится «расшариваемой»
    if (ok) { setCopied(true); clearTimeout(tRef.current); tRef.current = setTimeout(() => setCopied(false), 2200); }
  };
  return (
    <button onClick={copy} title={L.shareHint} aria-label={L.shareBtn}
      onMouseDown={(e) => { e.currentTarget.style.opacity = "0.7"; }}
      onMouseUp={(e) => { e.currentTarget.style.opacity = ""; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = ""; }}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, background: copied ? "#2ea043" : C.panel2, color: copied ? "#fff" : C.hi, border: `1px solid ${copied ? "#2ea043" : C.border}`, borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", transition: "background .15s, border-color .15s, opacity .1s" }}>
      <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>{copied ? "✓" : "🔗"}</span>
      {copied ? L.shareDone : L.shareBtn}
    </button>
  );
}

export default function App() {
  const [lang, setLang] = useState(() => {
    if (SHARE_INIT && SHARE_INIT.lang && LANGS.includes(SHARE_INIT.lang)) return SHARE_INIT.lang;
    try { const v = localStorage.getItem("lang"); if (v && LANGS.includes(v)) return v; } catch {}
    return "en"; // дефолт — английский, без авто-детекта языка браузера
  });
  useEffect(() => {
    try { localStorage.setItem("lang", lang); } catch {}
    document.documentElement.lang = lang;
  }, [lang]);
  const L = I18N[lang];

  const [cfg, setCfg] = useState(() => mergeTypes(mkCfg(OPEN), SHARE_INIT && SHARE_INIT.cfg));
  const [years, setYears] = useState(SHARE_INIT?.years ?? 10);
  const [yMax, setYMax] = useState(SHARE_INIT?.yMax ?? 100);
  const [hidden, setHidden] = useState(SHARE_INIT?.hidden ?? {});
  const [env, setEnv] = useState(SHARE_INIT?.env ?? "normal");
  const [selected, setSelected] = useState(SHARE_INIT?.selected ?? "chl");
  const [vaxHpv, setVaxHpv] = useState(SHARE_INIT?.vaxHpv ?? false);
  const [vaxHbv, setVaxHbv] = useState(SHARE_INIT?.vaxHbv ?? false);
  const [acts, setActs] = useState(SHARE_INIT?.acts ?? { vagR: true, vagI: false, analR: false, analI: false, oralR: true, oralI: true });
  const [activePreset, setActivePreset] = useState(SHARE_INIT ? (SHARE_INIT.preset ?? null) : "open");
  const [open, setOpen] = useState({});
  const [guideOpen, setGuideOpen] = useState({});
  const [mode, setMode] = useState(SHARE_INIT?.mode ?? "sti");
  const [pregWho, setPregWho] = useState(SHARE_INIT?.who ?? "woman");
  // Состояние беременности поднято в App — чтобы «Поделиться» сериализовал и его.
  const [w, setW] = useState(() => SHARE_INIT?.w ?? { age: 26, perWeek: 3 });
  const [meth, setMeth] = useState(() => SHARE_INIT?.meth ?? { condom_m: 100 });
  const [mcfg, setMcfg] = useState(() => mergeTypes(mkPregCfg(PREG_PRESETS.find((p) => p.key === "dating")), SHARE_INIT && SHARE_INIT.mcfg));
  const [manAge, setManAge] = useState(SHARE_INIT?.manAge ?? 28);
  const [activePreg, setActivePreg] = useState(SHARE_INIT ? (SHARE_INIT.preg ?? null) : "dating");
  C = mode === "preg" ? CP : CS;
  PREG = C.accent;

  const actSel = useMemo(() => actSelOf(acts), [acts]);

  // Снимок всех настроек для ссылки «Поделиться» (актуален на момент клика).
  const snapshot = () => ({ v: 1, lang, mode, who: pregWho, cfg, years, yMax, hidden, env, selected, vaxHpv, vaxHbv, acts, preset: activePreset, w, meth, mcfg, manAge, preg: activePreg });

  // Всплывашки .box у кнопок «i»: position:fixed + зажим в границы экрана.
  // Fixed не расширяет документ, поэтому всплывашка не порождает скролл и не вылезает за край.
  useEffect(() => {
    const place = (e) => {
      const src = e.target && e.target.closest && e.target.closest(".src");
      if (!src) return;
      const box = src.querySelector(".box"); if (!box) return;
      const m = 8;
      const ir = src.getBoundingClientRect();
      const bw = box.offsetWidth, bh = box.offsetHeight; // box уже display:block (hover/focus)
      box.style.position = "fixed";
      box.style.right = "auto"; box.style.bottom = "auto";
      // предварительно ставим над иконкой, выровняв правый край — без скачка из угла
      box.style.left = Math.max(m, ir.right - bw) + "px";
      box.style.top = Math.max(m, ir.top - bh - 6) + "px";
      requestAnimationFrame(() => {
        const vw = window.innerWidth, vh = window.innerHeight;
        const r = src.getBoundingClientRect();
        const w = box.offsetWidth, h = box.offsetHeight;
        const left = Math.max(m, Math.min(r.right - w, vw - w - m));
        let top = r.top - h - 6;            // по умолчанию над иконкой
        if (top < m) top = r.bottom + 6;    // не влезает сверху — под иконку
        top = Math.max(m, Math.min(top, vh - h - m));
        box.style.left = left + "px";
        box.style.top = top + "px";
      });
    };
    document.addEventListener("mouseover", place);
    document.addEventListener("focusin", place);
    return () => { document.removeEventListener("mouseover", place); document.removeEventListener("focusin", place); };
  }, []);

  const horizonM = years * 12;
  const setType = (key, patch) => { setCfg((c) => ({ ...c, [key]: { ...c[key], ...patch } })); setActivePreset(null); };
  const applyPreset = (pr) => { setCfg(mkCfg(pr)); setActivePreset(pr.key); };
  const toggle = (k) => setHidden((h) => ({ ...h, [k]: !h[k] }));

  const riskPct = (s, t) => (1 - survivalAt(withEnv(s, env), t, cfg, veMulOf(s, vaxHpv, vaxHbv), actSel)) * 100;

  const chartData = useMemo(() => {
    const st = Math.max(1, Math.ceil(horizonM / 170));
    const pts = [];
    for (let t = 0; t <= horizonM; t += st) {
      const row = { t };
      STIS.forEach((s) => {
        const sv = survivalAt(withEnv(s, env), t, cfg, veMulOf(s, vaxHpv, vaxHbv), actSel);
        row[s.key] = (1 - sv) * 100;
      });
      pts.push(row);
    }
    return pts;
  }, [cfg, years, vaxHpv, vaxHbv, actSel, env]);

  const built = useMemo(() => buildPartnersTyped(cfg, horizonM), [cfg, horizonM]);
  const packed = useMemo(() => packLanes(built.list), [built]);
  const avgWeek = cfg.steady.count * cfg.steady.perWeek + cfg.casual.count * cfg.casual.dur / 12 * cfg.casual.perWeek + cfg.hookup.count / 52;

  const ts = years <= 12 ? 1 : years <= 30 ? 5 : 10;
  const ticks = []; for (let y = 0; y <= years; y += ts) ticks.push(y * 12);
  const top = [...STIS].filter((s) => !hidden[s.key]).sort((a, b) => riskPct(b, horizonM) - riskPct(a, horizonM))[0];
  const selSti = STIS.find((x) => x.key === selected);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.hi, fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif", padding: "28px 18px 48px" }}>
      <style>{`
        .rng { -webkit-appearance:none; appearance:none; width:100%; height:4px; border-radius:4px; background:${C.border}; outline:none; }
        .rng::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:18px; height:18px; border-radius:50%; background:${C.accent}; cursor:grab; border:3px solid ${C.bg}; box-shadow:0 0 0 1px ${C.accent}; }
        .rng::-webkit-slider-thumb:active { cursor:grabbing; }
        .rng::-moz-range-thumb { width:18px; height:18px; border-radius:50%; background:${C.accent}; cursor:grab; border:3px solid ${C.bg}; }
        summary { cursor:pointer; }
        .tbl-wrap { overflow-x:auto; }
        table.inf { border-collapse:collapse; width:100%; min-width:760px; font-size:13px; }
        table.inf th, table.inf td { text-align:left; padding:10px 12px; border-bottom:1px solid ${C.border}; vertical-align:middle; }
        table.inf th { color:${C.dim}; font-weight:500; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; }
        .num { font-variant-numeric:tabular-nums; }
        .chk { width:17px; height:17px; cursor:pointer; }
        .studio { display:grid; grid-template-columns:1fr; gap:14px; align-items:start; margin-bottom:14px; }
        .studio-chart { position:sticky; top:0; z-index:5; order:-1; box-shadow:0 8px 16px -6px rgba(0,0,0,.55); }
        .chartbox { height:150px; }
        @media (min-width:880px) {
          .studio { grid-template-columns:360px minmax(0,1fr); }
          .studio-controls { grid-column:1; grid-row:1; }
          .studio-chart { grid-column:2; grid-row:1; top:16px; order:0; box-shadow:none; }
          .chartbox { height:380px; }
        }
        .src { position:relative; display:inline-flex; align-items:center; gap:5px; cursor:help; }
        .src .ic { width:12px; height:12px; border-radius:50%; border:1px solid ${C.dim}; color:${C.dim}; font-size:9px; line-height:1; display:inline-flex; align-items:center; justify-content:center; opacity:.85; }
        .src .box { display:none; position:absolute; right:0; bottom:140%; width:280px; max-width:calc(100vw - 16px); white-space:normal; word-break:break-word; background:${C.panel2}; border:1px solid ${C.border}; border-radius:8px; padding:10px 12px; font-size:12px; line-height:1.5; color:${C.mid}; z-index:20; box-shadow:0 8px 24px rgba(0,0,0,.4); text-transform:none; letter-spacing:0; font-weight:400; }
        .src:hover .box, .src:focus-within .box { display:block; }
        .src.dn .box { top:150%; bottom:auto; }
        .pill { background:${C.panel2}; border:1px solid ${C.border}; color:${C.mid}; padding:6px 12px; border-radius:999px; font-size:12px; cursor:pointer; }
        .pill.on { background:${C.accent}; color:${C.bg}; border-color:${C.accent}; font-weight:600; }
        .ghd { color:${C.dim}; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:5px; }
        .gtx { color:${C.mid}; font-size:12.5px; line-height:1.55; }
        table.inf tbody tr.inf-row { cursor:pointer; transition:background .12s; }
        table.inf tbody tr.inf-row:hover { background:#ffffff0a; }
        table.inf tbody tr.inf-row.on { background:#ffffff12; }
        table.inf tbody tr.inf-row.on:hover { background:#ffffff16; }
        .rich [data-hi] { color:${C.hi}; }
        .rich [data-grn] { color:#4dd4ac; }
        .rich [data-red] { color:#ff7b73; }
        [data-f] { font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace; color:#8fd0e6; font-size:0.93em; letter-spacing:0.1px; }
      `}</style>

      <div style={{ maxWidth: 940, margin: "0 auto", position: "relative" }}>
        <LangSwitch lang={lang} setLang={setLang} />
        <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          <button onClick={() => setMode("sti")} style={SEG(mode === "sti")}>{L.modeSti}</button>
          <button onClick={() => setMode("preg")} style={SEG(mode === "preg")}>{L.modePreg}</button>
        </div>

        <div style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, margin: 0 }}>{mode === "sti" ? L.title : L.pregTitle}</h1>
            <div style={{ marginLeft: "auto" }}><ShareButton snapshot={snapshot} L={L} /></div>
          </div>
          {(mode === "sti" ? L.intro : L.pregIntro) && <p style={{ color: C.mid, fontSize: 14, margin: 0, lineHeight: 1.5 }}>{mode === "sti" ? L.intro : L.pregIntro}</p>}
        </div>

        <div style={{ background: `${C.accent}1a`, border: `1px solid ${C.accent}`, borderRadius: 12, padding: "14px 16px", marginBottom: 18, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ flex: "0 0 24px", width: 24, height: 24, borderRadius: "50%", background: C.accent, color: C.bg, fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>!</span>
          <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.55 }}><b style={{ color: C.hi }}>{mode === "sti" ? L.warnTitle : L.pregWarnTitle}</b> {mode === "sti" ? L.warnBody : L.pregWarnBody}</div>
        </div>

        {mode === "sti" && (<>
        <div className="studio">
          <div className="studio-controls">
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.6, display: "inline-flex", alignItems: "center" }}>{L.preset}<Info text={L.presetInfo} /></div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {PRESETS.map((pr) => (<button key={pr.key} onClick={() => applyPreset(pr)} className={"pill " + (activePreset === pr.key ? "on" : "")}>{pr.label[lang]}</button>))}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
              {TYPES.map((meta) => (<TypeCard key={meta.key} meta={meta} t={cfg[meta.key]} setT={(patch) => setType(meta.key, patch)} open={!!open[meta.key]} toggleOpen={() => setOpen((o) => ({ ...o, [meta.key]: !o[meta.key] }))} lang={lang} L={L} />))}
            </div>

            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 18px" }}>
              <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10, display: "inline-flex", alignItems: "center" }}>{L.sexActs}<Info text={L.sexActsInfo} /></div>
              <SexActs acts={acts} setActs={setActs} lang={lang} />
              {actSel.length === 0 && <div style={{ color: "#ff922b", fontSize: 12, marginTop: 10 }}>{L.noActs}</div>}

              <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 0.6, margin: "16px 0 10px" }}>{L.protection}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[{ k: "hpv", on: vaxHpv, set: setVaxHpv, lab: L.vaxHpv }, { k: "hbv", on: vaxHbv, set: setVaxHbv, lab: L.vaxHbv }].map((v) => (
                  <button key={v.k} onClick={() => v.set((x) => !x)} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: v.on ? `${C.accent}22` : "transparent", border: `1px solid ${v.on ? C.accent : C.border}`, color: v.on ? C.hi : C.mid, padding: "8px 13px", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
                    <span style={{ width: 16, height: 16, borderRadius: 4, border: `1px solid ${v.on ? C.accent : C.dim}`, background: v.on ? C.accent : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", color: C.bg, fontSize: 11, fontWeight: 700 }}>{v.on ? "✓" : ""}</span>{v.lab}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="studio-chart" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 16px 12px" }}>
            <div style={{ display: "flex", gap: 26, flexWrap: "wrap", marginBottom: 16 }}>
              <Slider label={L.horizon} value={years} set={setYears} min={1} max={50} step={1} valueText={`${years} ${yearsWord(years, lang)}`} hint={L.horizonHint} labelH={36} />
              <Slider label={L.scale} value={yMax} set={setYMax} min={1} max={100} step={1} valueText={`${lang === "en" ? "to" : lang === "sr" ? "do" : "до"} ${yMax}%`} hint={L.scaleHint} labelH={36} />
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
              {STIS.filter((s) => !hidden[s.key]).map((s) => (<span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.mid }}><span style={{ width: 14, height: 0, borderTop: `3px ${s.grounded ? "solid" : "dashed"} ${s.color}`, display: "inline-block" }} />{s.label[lang]}</span>))}
            </div>
            <div className="chartbox">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="t" type="number" domain={[0, horizonM]} ticks={ticks} interval={0} stroke={C.dim} tick={{ fontSize: 12, fill: C.dim }} tickFormatter={(t) => (t === 0 ? "0" : `${t / 12}${L.yrAxis}`)} />
                  <YAxis domain={[0, yMax]} allowDataOverflow stroke={C.dim} tick={{ fontSize: 12, fill: C.dim }} tickFormatter={(v) => `${v}%`} width={46} />
                  <Tooltip content={(p) => <ChartTooltip {...p} hidden={hidden} lang={lang} L={L} />} />
                  {STIS.map((s) => (hidden[s.key] ? null : <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2.2} dot={false} strokeDasharray={s.grounded ? "0" : "6 4"} isAnimationActive={false} />))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
              <div style={{ color: C.mid, fontSize: 13 }}>{top ? L.topRiskLine(years, yearsWord(years, lang), top.label[lang], pctVal(riskPct(top, horizonM), lang), top.color) : L.enableOne}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5, marginRight: 2 }}>{L.envLabel}</span>
                {[["normal", L.envNormal], ["high", L.envHigh], ["outbreak", L.envOutbreak]].map(([k, lab]) => (
                  <button key={k} className={"pill " + (env === k ? "on" : "")} onClick={() => setEnv(k)}>{lab}</button>
                ))}
                <Info text={L.envInfo} />
              </div>
            </div>
          </div>
        </div>

        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 18px 14px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{L.structTitle}</h2>
            <div className="rich" style={{ fontSize: 12, color: C.mid }}>{L.structStats(dec(avgWeek.toFixed(1), lang), packed.lanes, built.total)}</div>
          </div>
          <p style={{ color: C.dim, fontSize: 12, margin: "0 0 14px", lineHeight: 1.5 }}>
            <span style={{ color: "#f0a500" }}>● {L.legSteady}</span> · <span style={{ color: "#2ec4b6" }}>● {L.legCasual}</span> · <span style={{ color: "#4dabf7" }}>● {L.legHookup}</span>{L.structLegendTail}
          </p>
          {packed.list.length === 0 ? <div style={{ color: C.mid, fontSize: 13, padding: "20px 0", textAlign: "center" }}>{L.noPartners}</div> : <><Timeline packed={packed} horizonM={horizonM} years={years} lang={lang} />{built.total > packed.list.length && <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>{L.shownPart(built.total)}</div>}</>}
        </div>

        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "6px 6px", marginBottom: 14 }}>
          <div className="tbl-wrap">
            <table className="inf">
              <thead><tr><th style={{ width: 34 }}></th><th>{L.thInfection}</th><th>{L.thRisk(years, yearsWord(years, lang))}</th><th>{L.thPerAct}</th><th>{L.thTreatment}</th><th>{L.thConsequences}</th><th style={{ width: 60, textAlign: "right" }}>{L.thSource}</th></tr></thead>
              <tbody>
                {STIS.flatMap((s) => {
                  const exp = !!guideOpen[s.key];
                  const accLab = L.acc[s.acc];
                  const rows = [
                  <tr key={s.key} className={"inf-row" + ((selected === s.key || exp) ? " on" : "")} onClick={() => { setSelected(s.key); setGuideOpen((g) => ({ ...g, [s.key]: !g[s.key] })); }} title={exp ? L.collapseGuide : L.openGuide} style={{ borderLeft: `3px solid ${SEV[s.sev]}`, opacity: hidden[s.key] ? 0.45 : 1 }}>
                    <td onClick={(e) => e.stopPropagation()}><input className="chk" type="checkbox" checked={!hidden[s.key]} onChange={() => toggle(s.key)} style={{ accentColor: s.color }} /></td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span style={{ color: s.color, marginRight: 7 }}>{s.grounded ? "●" : "◌"}</span>{s.label[lang]}
                      {((s.key === "hpv" && vaxHpv) || (s.key === "hbv" && vaxHbv)) && <span title={s.vax.note[lang]} style={{ marginLeft: 8, fontSize: 11, color: "#38d9a9", background: "#38d9a922", border: "1px solid #38d9a955", padding: "1px 7px", borderRadius: 6 }}>{L.vaccinated}</span>}
                      <span aria-hidden style={{ marginLeft: 8, color: exp ? s.color : C.dim, fontSize: 10 }}>{exp ? "▾" : "▸"}</span>
                    </td>
                    <td className="num" style={{ color: C.hi, fontWeight: 600 }}>{pctVal(riskPct(s, horizonM), lang)}</td>
                    <td className="num" style={{ color: C.mid, whiteSpace: "nowrap" }}>{pctAct(1 - encSurvOf(s, actSel, 1), lang)} <span style={{ color: C.dim }}>→</span> {pctAct(1 - encSurvOf(s, actSel, 1 - s.e), lang)}</td>
                    <td><span style={{ background: `${SEV[s.sev]}22`, color: SEV[s.sev], padding: "3px 8px", borderRadius: 6, fontSize: 12, fontWeight: 500, display: "inline-block" }}>{s.treat[lang]}</span></td>
                    <td style={{ color: C.mid, fontSize: 12.5 }}>{s.cons[lang]}</td>
                    <td style={{ textAlign: "right" }}><span className="src" tabIndex={0}><span style={{ width: 8, height: 8, borderRadius: "50%", background: ACC_COLOR[s.acc] }} title={`${L.accuracyLab}: ${accLab}`} /><span className="ic">i</span><span className="box"><b style={{ color: C.hi }}>{L.accuracyLab}: {accLab}</b><br />{s.src[lang]}</span></span></td>
                  </tr>,
                  ];
                  if (exp) rows.push(
                    <tr key={s.key + "-g"} style={{ borderLeft: `3px solid ${s.color}` }}>
                      <td colSpan={7} style={{ background: C.panel2, padding: 0 }}>
                       <div style={{ position: "sticky", left: 0, width: "calc(100vw - 84px)", maxWidth: 860, boxSizing: "border-box", padding: "14px 16px" }}>
                        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                          <div><div className="ghd">{L.sympt}</div><div className="gtx">{s.guide.symptoms[lang]}</div></div>
                          <div><div className="ghd">{L.treatm}</div><div className="gtx">{s.guide.treatment[lang]}</div></div>
                          <div><div className="ghd">{L.conseq}</div><div className="gtx">{s.guide.consequences[lang]}</div></div>
                        </div>
                        {ENV[s.key] && (
                          <div style={{ marginTop: 14 }}>
                            <div className="ghd">{L.envGuideLabel}</div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "7px 0 9px" }}>
                              {[[L.envNormal, 1], [L.envHigh, ENV[s.key].high], [L.envOutbreak, ENV[s.key].out]].map(([lab, mul], i) => (
                                <span key={i} style={{ display: "inline-flex", alignItems: "baseline", gap: 6, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 10px" }}>
                                  <span style={{ fontSize: 11, color: C.dim }}>{lab}</span>
                                  <span className="num" style={{ fontSize: 12.5, color: C.mid }}>×{dec(String(mul), lang)}</span>
                                </span>
                              ))}
                            </div>
                            <div className="gtx">{ENV[s.key].note[lang]} <a href={ENV[s.key].src.url} target="_blank" rel="noopener noreferrer" style={{ color: s.color, textDecoration: "none" }}>{ENV[s.key].src.label[lang]} ↗</a></div>
                          </div>
                        )}
                        <div style={{ marginTop: 12, fontSize: 12, color: C.dim }}>{L.sourcesLab}: {s.guide.sources.map((src, i) => (<span key={i}>{i > 0 ? " · " : ""}<a href={src.url} target="_blank" rel="noopener noreferrer" style={{ color: s.color, textDecoration: "none" }}>{typeof src.label === "string" ? src.label : src.label[lang]} ↗</a></span>))} {L.guideTail}</div>
                       </div>
                      </td>
                    </tr>
                  );
                  return rows;
                })}
              </tbody>
            </table>
          </div>
        </div>

        <details open style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 14 }}>
          <summary style={{ color: C.hi, fontSize: 15, fontWeight: 600 }}>{L.breakdownTitle}</summary>
          {L.breakdownIntro && <p style={{ color: C.mid, fontSize: 13, lineHeight: 1.6, margin: "12px 0 12px" }}>{L.breakdownIntro}</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14, marginBottom: 16 }}>
            {STIS.map((s) => (<button key={s.key} onClick={() => setSelected(s.key)} style={{ border: `1px solid ${selected === s.key ? s.color : C.border}`, background: selected === s.key ? `${s.color}22` : "transparent", color: selected === s.key ? C.hi : C.mid, padding: "6px 12px", borderRadius: 999, fontSize: 12.5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ color: s.color }}>●</span>{s.label[lang]}</button>))}
          </div>
          <Breakdown s={withEnv(selSti, env)} envMul={envMulOf(selSti, env)} cfg={cfg} years={years} veMul={veMulOf(selSti, vaxHpv, vaxHbv)} actSel={actSel} lang={lang} L={L} />
        </details>

        <details style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 14 }}>
          <summary style={{ color: C.hi, fontSize: 15, fontWeight: 600 }}>{L.assumTitle}</summary>
          <div className="rich" style={{ color: C.mid, fontSize: 13, lineHeight: 1.6, marginTop: 14 }}>
            {[L.assumP1, L.assumP2, L.assumPEnv, L.assumP3, L.assumP4, L.assumP6].map((a, i) => (
              <div key={i} style={{ borderLeft: `2px solid ${C.border}`, paddingLeft: 12, marginBottom: 13 }}>{a}</div>
            ))}
            <div style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px", marginBottom: 13 }}>
              <div className="ghd" style={{ marginBottom: 5 }}>{L.assumExTitle}</div>
              <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 8 }}>{L.assumExFormula}</div>
              {[["hiv", "outbreak", "hookup", 4], ["hiv", "outbreak", "steady", 1], ["hiv", "normal", "hookup", 4], ["chl", "normal", "hookup", 4], ["syp", "outbreak", "hookup", 4]].map(([k, envk, poolk, pm], i) => {
                const s = STIS.find((x) => x.key === k); const em = envk === "outbreak" ? ENV[k].out : 1; const res = Math.min(1, s.p * em * pm);
                const pp = (x) => dec(x * 100 < 10 ? (x * 100).toFixed(1).replace(/\.0$/, "") : String(Math.round(x * 100)), lang) + "%";
                return (<div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "4px 0", borderTop: i ? `1px solid ${C.border}` : "none", flexWrap: "wrap" }}>
                  <span><span style={{ color: s.color }}>●</span> {s.label[lang]} · {envk === "outbreak" ? L.envOutbreak : L.envNormal} · {poolk === "hookup" ? L.legHookup : L.legSteady}</span>
                  <span className="num" data-f style={{ whiteSpace: "nowrap" }}>{pp(s.p)} × {dec(String(em), lang)} × {pm} = <b style={{ color: C.hi }}>{pp(res)}</b></span>
                </div>);
              })}
            </div>
            <div style={{ fontSize: 12, color: C.dim }}>{L.assumSources}</div>
          </div>
        </details>
        </>)}

        {mode === "preg" && <Pregnancy who={pregWho} setWho={setPregWho} years={years} setYears={setYears} yMax={yMax} setYMax={setYMax} lang={lang} L={L} w={w} setW={setW} meth={meth} setMeth={setMeth} mcfg={mcfg} setMcfg={setMcfg} manAge={manAge} setManAge={setManAge} activePreg={activePreg} setActivePreg={setActivePreg} />}

        <p style={{ color: C.dim, fontSize: 12, lineHeight: 1.6, textAlign: "center", margin: 0 }}>{L.footerDisclaimer}</p>
        <p style={{ color: C.dim, fontSize: 11, lineHeight: 1.5, textAlign: "center", margin: "2px 0 0" }}>{L.footerNoWarranty}</p>
        <p style={{ color: C.dim, fontSize: 12, textAlign: "center", margin: "8px 0 0" }}><a href="https://github.com/UserNameIsAlredyTaken/safesex" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "none" }}>{L.githubLink}</a></p>
      </div>
    </div>
  );
}
