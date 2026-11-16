MÓJ DOMEK – podgląd 3D domu w przeglądarce (wersja 1)
=====================================================

Model domu w 3D z gniazdkami, włącznikami, dzwonkiem i lampami.
Dwie wersje:
  - na komputerze (URUCHOM.bat) – zawsze najświeższe dane, telefon w domowym Wi-Fi,
  - w internecie (GitHub Pages):  https://adamczochrowski-netizen.github.io/M-jDomek/
    – telefon działa wszędzie; dane trafiają tam dopiero po WYSLIJ_NA_GITHUB.bat.

UWAGA: repozytorium https://github.com/adamczochrowski-netizen/M-jDomek jest na razie
PUBLICZNE – każdy, kto zna adres, zobaczy układ domu, położenie gniazdek i nazwy pokoi
(także obwody.json, gdy zostanie wypełniony). Po przełączeniu repo na prywatne
GitHub Pages przestanie działać na darmowym koncie (wersja na komputerze działa dalej).


JAK URUCHOMIĆ
-------------
1. Kliknij dwa razy  URUCHOM.bat  (w tym folderze: Projekt\aplikacja).
2. Otworzy się czarne okno serwera i przeglądarka z adresem  http://localhost:8642/
3. Okno serwera zostaw otwarte, dopóki oglądasz model. Zamknięcie okna = koniec podglądu.

Za pierwszym razem Windows może zapytać, czy pozwolić Pythonowi na dostęp do sieci –
zaznacz „Sieci prywatne” i zezwól (to potrzebne tylko dla telefonu).

Na telefonie: w oknie serwera jest linijka
    Na telefonie (ta sama sieć Wi-Fi):  http://192.168.x.x:8642/
Wpisz ten adres w przeglądarce telefonu (telefon musi być w tym samym Wi-Fi co komputer,
a komputer musi mieć włączony serwer). W Safari/Chrome można dodać skrót na ekran główny.

Tylko na tym komputerze (bez telefonu):  python serwer.py --lokalnie
Jeśli port 8642 jest zajęty, serwer sam weźmie następny (8643, 8644…) – adres jest w oknie.

Nie otwieraj index.html dwuklikiem – przeglądarka nie pozwala wtedy wczytać danych
(strona pokaże komunikat, żeby użyć URUCHOM.bat).

Potrzebny jest Python (ten sam, którego używa ODSWIEZ.bat). Three.js (biblioteka 3D) jest
w folderze lib – internet nie jest potrzebny.


MENU
----
(na telefonie menu jest dolnym paskiem)
Widok          – model 3D domu z elektryką (opis niżej).
Instalacje     – Elektryka: rozdzielnica (karta „Rozdzielnica”; do czasu zdjęcia skrzynki – prawdopodobny
                 skład z listy zakupów), gniazdka i włączniki w każdym pomieszczeniu (dotknij, żeby
                 otworzyć kartę punktu na modelu), osprzęt, lista tego, co jeszcze udokumentować.
                 Hydraulika: studnia i zasilanie domu (karta „Studnia” + zakupy), zawory/kurki z wyszukiwarką
                 (karta „Zawory”), lista „do ustalenia”. Kanalizacja: co zebrać.
                 Przy wpisach znaczek wiarygodności: potwierdzona / prawdopodobna / niezweryfikowana.
Ogrzewanie     – pompa ciepła (karta „Pompa ciepła”) i rozdzielacz podłogówki: kurki z karty „Pętle”;
                 dotknięcie kurka pokazuje rury tego pomieszczenia na modelu (reszta przygaszona).
Linki „pokaż na modelu” otwierają rzut z góry przybliżony do pomieszczenia
(adresy …#pokoj=Kuchnia, …#ogrzewanie=Kuchnia).
Wyposażenie (dawniej „Co mamy, co dokupić”)
               – „Wyposażenie domu”: rzeczy po pomieszczeniach ze stanem mamy / wybieramy
                 (są linki do kandydatów) / do kupienia, uwagami i linkami do sklepów; podpowiedź,
                 gdy coś podobnego jest już w zakupach.
               – „Kupione”: wszystko z „Poniesionych kosztów”, w kategoriach (elektryka, narzędzia,
                 budowa i wykończenie, woda, łazienka, ogród…), bez kwot.
               – wyszukiwarka (np. „wkrętarka”, „Legrand”, „wanna”).
Skąd te dane – dwa Arkusze Google:
  „Domek Wirko”  – Wasz główny, prywatny arkusz. Tu dopisujecie i poprawiacie wyposażenie
                   i zakupy (np. marki i modele). Aplikacja nie zna jego adresu.
  „MójDomek”     – PUBLICZNY arkusz dla aplikacji:
                   https://docs.google.com/spreadsheets/d/1zcDhbn7p6nb2LXemT0zHsZ6MLTl0SBVtr6OWUkGAEHo
                   Karty Wyposażenie i Kupione same pobierają dane z „Domek Wirko” (IMPORTRANGE;
                   z kosztów tylko rok, miesiąc, nazwa, sklep). Karty „Pompa ciepła”, „Pętle”,
                   „Rozdzielnica”, „Zawory” i „Studnia” wypełnia się bezpośrednio tutaj (opis kolumn
                   w karcie „Info”). Nie zmieniaj nazw kart ani pierwszego wiersza – aplikacja ich szuka.
Zmiany w arkuszach widać w aplikacji po odświeżeniu (bez WYSLIJ_NA_GITHUB.bat).
„Domek Wirko” może być ustawiony na „Ograniczony dostęp” – „MójDomek” i tak go odczyta.


KONTO I WSPÓLNA BAZA (Firebase) – wdrażane etapami
---------------------------------------------------
Przycisk „Zaloguj” w nagłówku: logowanie kontem Google (projekt Firebase mylittleproject-e91e3).
Dostęp mają tylko konta wpisane w regułach bazy: plik Projekt\dokumentacja\firestore.rules
(poza repozytorium; publikuje się go w konsoli Firebase: Firestore Database → Reguły → Opublikuj,
albo skryptem „Firebase - baza i reguły (Cloud Shell).sh” z tego samego folderu).
Bez logowania wszystko działa jak dotąd, na punktach z rysunku (dane_modelu.json).

Po zalogowaniu (etap 2):
  • punkty elektryczne są czytane ze wspólnej bazy (domy/moj-dom/elementy); na pasku u góry
    widać „· punkty z bazy”, a w karcie punktu – „Pewność położenia” (prawdopodobna/potwierdzona),
    źródło, numer wersji, kto i kiedy zmienił;
  • kopia bazy zostaje na urządzeniu – aplikacja pokazuje punkty także bez internetu;
    „Wyloguj” usuwa tę kopię z urządzenia;
  • panel konta porównuje bazę z rysunkiem. Gdy po ODSWIEZ.bat coś się zmieni (nowy punkt,
    inne położenie, punkt w [Punkty usunięte]), przy imieniu pojawia się liczba zmian, a w panelu
    lista i przycisk „Przenieś zmiany do bazy”. Nic nie jest kasowane: punkt, którego nie ma już
    na rysunku, dostaje w bazie oznaczenie „usunięty”. Każdy zapis ma numer wersji i wpis w historii
    (domy/moj-dom/historia: kto, kiedy, co było przed, co jest po);
  • położenia z rysunku są w bazie jako PRAWDOPODOBNE – nic nie staje się „potwierdzone” samo.
    Gdy generuj.py zacznie zapisywać przy punkcie pole „zrodlo” (pomiar / rysunek / szacunek),
    punkty z pomiaru w wymiary.ini pokażą się jako zmiana do przeniesienia z pewnością POTWIERDZONA.
Kolejne etapy (wspólny zapis, historia zmian, tryb lokalny/globalny, zdjęcia) – opis w
Projekt\dokumentacja\Audyt ETAP 0 - Mój dom.md, rozdział 12b.


SKĄD SĄ DANE I JAK DZIAŁA ODŚWIEŻANIE
--------------------------------------
Aplikacja nie ma własnej kopii wymiarów. Przy starcie czyta plik
    Projekt\skrypty\dane_modelu.json
który tworzy ODSWIEZ.bat (skrypty\generuj.py) z wymiary.ini.

Kolejność pracy:
  1. poprawiasz wymiary.ini,
  2. klikasz ODSWIEZ.bat (jak dotąd – robi też CAD i Blendera),
  3. aplikacja w przeglądarce sama zauważa nowy plik (sprawdza co ok. 4 sekundy)
     i przebudowuje model; na górze pojawia się „Wczytano nowe dane po ODSWIEZ.bat”.
     Na pasku u góry widać datę i godzinę danych.
Można też kliknąć „Odśwież dane” w panelu albo przeładować stronę (F5).
Zmiany w obwody.json też wczytują się same.

Serwer pokazuje w sieci tylko folder aplikacji i ten jeden plik danych – wymiary.ini,
CAD, Blender i reszta folderu Projekt nie są dostępne z telefonu ani z innych komputerów
(pliki ukryte, np. folder .git, też nie).


WERSJA W INTERNECIE (GitHub Pages)
----------------------------------
Adres:  https://adamczochrowski-netizen.github.io/M-jDomek/
Ten folder (Projekt\aplikacja) jest połączony z repozytorium na GitHubie
(adamczochrowski-netizen/M-jDomek, gałąź main). Strona w internecie pokazuje
kopię danych: plik dane_modelu.json w tym folderze.

Po zmianach w wymiary.ini:
  1. ODSWIEZ.bat (jak zawsze),
  2. WYSLIJ_NA_GITHUB.bat – kopiuje świeży skrypty\dane_modelu.json do tego folderu,
     zapisuje zmiany (commit) i wysyła je na GitHub,
  3. po 1–2 minutach odśwież stronę w telefonie.
Wersja w internecie NIE sprawdza sama zmian co kilka sekund (to robi tylko wersja
na komputerze) – trzeba przeładować stronę.
Commity są podpisane adresem zastępczym GitHuba (…@users.noreply.github.com),
żeby w publicznym repo nie było widać prywatnego e-maila.


OBSŁUGA
-------
Mysz:   lewy przycisk – obrót, prawy – przesuwanie, kółko – przybliżanie.
Telefon: 1 palec – obrót, 2 palce – przybliżanie i przesuwanie. Panel: przycisk „Warstwy”.
Wygląd: Ciemny (domyślnie) / Jasny / Jak w telefonie – na komputerze trzy ikony w nagłówku
(księżyc, słońce, półkole), na telefonie w panelu konta (przycisk z imieniem albo „Zaloguj”).
Każde urządzenie pamięta swój wybór. Kolory są zmiennymi na początku styl.css (oba motywy
spełniają kontrast WCAG AA); na telefonie tekst ma 16 px, a przyciski co najmniej 44 px.
Ikony punktów: rodzaj po kształcie i literze (gniazdko – kółko, do sprzętu – kwadrat, indukcja –
sześciokąt, włącznik – prostokąt, dzwonek/gong – romb, lampa – gwiazdka), kolor elektryki
żółto-pomarańczowy (rozdz. 17: czerwony = ogrzewanie, niebieski = woda). Zielony znaczek ✓ –
położenie potwierdzone pomiarem; szara ikona z „?” – niezweryfikowane. Punkty, które na ekranie
nachodzą na siebie, łączą się w bańkę z liczbą – dotknięcie przybliża. Karta punktu ma przyciski
„Pokaż na rzucie”, „Kopiuj ID” i „Udostępnij link”. Etykiety pomieszczeń pokazują wysokość
sufitu dopiero po przybliżeniu.
Panel „Warstwy”: na górze tryby Standard / Instalacje / Techniczny (gotowe zestawy warstw; teksty
o plikach – wymiary.ini, obwody.json – tylko w trybie Technicznym), niżej zwijane grupy Budynek,
Elektryka, Ogrzewanie. Na telefonie uchwyt panelu przełącza pół ekranu / cały ekran.
Instalacje i Ogrzewanie: braki to plakietka „Do uzupełnienia: N” w nagłówku karty i zwinięta lista
na jej końcu; wszystkie razem – strona #braki („Do uzupełnienia”). Instrukcje „jak wpisywać
w arkuszu” są w zwiniętym „ℹ Jak uzupełnić”, widocznym tylko po zalogowaniu. Rozdzielnica:
przełącznik Rysunek / Lista (na telefonie domyślnie lista), rysunek powiększa się przyciskami
+/− albo dwoma palcami. Gdy w karcie Rozdzielnica są wpisane Punkty, „pokaż te punkty na modelu”
podświetla je w 3D (adres #punkty=id1,id2).
Ekran startowy (#start; na telefonie otwiera się sam, na komputerze – kliknij „Mój domek”):
kafelki „Nie ma prądu” → rozdzielnica, „Nie ma wody” → studnia i zawory, „Zimno w domu” → pompa
i kurki, „Szukaj”, „Widok domu”, „Do uzupełnienia (N)”; po zalogowaniu – ostatnio zmienione
elementy bazy. Kafelki prowadzą tylko do istniejących kart (bez własnych procedur awaryjnych).
Model 3D buduje się dopiero po wejściu w „Widok” – start na słabym telefonie jest szybszy.
Wyszukiwarka (lupa w nagłówku albo klawisz „/”): pomieszczenia, punkty po ID i opisie (kuchnia-Z06),
wyłączniki („2.4”, „ganek” → #wyl=2.4), kurki, zawory, wyposażenie i zakupy; Enter otwiera pierwszy
wynik, telefon pamięta ostatnie wyszukiwania.
Stan danych: na komputerze (szerokim) plakietka w nagłówku („Zsynchronizowano 08:12”, „Bez internetu”,
„Dane z …”), na telefonie kolor kropki przy koncie; szczegóły i „Odśwież dane” – w panelu konta.
Przygotowane pod zapis globalny: „N zmian czeka”, „Błąd zapisu – ponów” (js/status.js).
Wczytywanie: szare „szkielety” kart; gdy trwa dłużej niż kilka sekund albo arkusz się nie wczyta –
wyjaśnienie i przycisk „Spróbuj ponownie”.
Aplikacja na ekranie głównym telefonu (PWA): w Chrome „Dodaj do ekranu głównego” / „Zainstaluj”,
w Safari „Udostępnij → Do ekranu początkowego”. Otwiera się bez paska adresu, na ostatnio używanej
sekcji. sw.js zapisuje szkielet aplikacji, dane domu i karty arkusza – po utracie internetu
pokazuje ostatnią kopię (zawsze najpierw próbuje sieci, więc nowe wersje przychodzą od razu).
Awaryjnie: dopisz do adresu ?bezsw – strona wyłączy tryb offline i wyczyści zapisane pliki.

„Rzut z góry” – widok jak rysunek (bez perspektywy); przyciskiem obok wracasz do 3D.
⟲ – ustawia widok od nowa.
„Ujęcia kamer” – te same miejsca, z których zrobione są podglądy w Blenderze
                 (np. kuchnia z salonu, wiatrołap, pom. gospodarcze).

Warstwy (zaznacz/odznacz): ściany (z suwakiem wysokości – można je „przyciąć”, żeby
zajrzeć do środka), okna i drzwi (z przełącznikiem „Drzwi: Otwarte / Zamknięte” – zapamiętywany;
zamknięte skrzydło stoi w otworze, otwarte jak na rzucie), podłogi, ogrzewanie podłogowe (czerwone paski = rury
w wylewce, w całym domu – nie wiercić w posadzce), sufity (każde pomieszczenie na swojej
wysokości, niebieskie płaszczyzny), belka, meble, sanitariaty, pompa ciepła (jednostka zewnętrzna; wysokość nad
ziemią to szacunek), teren (siatka co 1 m),
nazwy pomieszczeń, a w części „Elektryka” każdy typ osobno i lampy zewnętrzne.
Przy każdym typie jest liczba: ramki i gniazda (np. potrójne gniazdko = 1 ramka, 3 gniazda).
Meble są wyłączone w wymiary.ini ([Meble] pokaż = nie) – po zmianie na „tak” i ODSWIEZ.bat
pojawią się w aplikacji.

Kliknij (dotknij) kółko punktu – otworzy się karta:
  typ, pomieszczenie, która to ściana na rzucie (lewa/prawa/górna/dolna), jej grubość
  i co jest po drugiej stronie, wysokość środka nad podłogą (na zewnątrz także nad terenem),
  liczba w ramce, odległości wzdłuż ściany do najbliższych ścian (strzałki jak na rzucie),
  opis, obwód (gdy będzie wpisany w obwody.json) i identyfikator punktu.
Uwaga: część położeń pochodzi z rysunku (±10–15 cm). Przed wierceniem sprawdź wykrywaczem.

Link do konkretnego punktu: dopisz do adresu  #punkt=IDENTYFIKATOR, np.
    http://192.168.x.x:8642/#punkt=kuchnia-Z06
Strona otworzy się od razu z kartą tego punktu.

Ustawienia warstw zapamiętuje przeglądarka (osobno na każdym urządzeniu).


IDENTYFIKATORY PUNKTÓW
----------------------
Każdy punkt ma identyfikator:  pomieszczenie-TYPnumer, np. kuchnia-Z06, salon-W02,
zewnatrz-L01. Typy: Z gniazdko zwykłe, S do sprzętu, I indukcja, W włącznik,
D dzwonek, G gong, L lampa zewnętrzna. Identyfikator pokazuje karta (przycisk „kopiuj”).
Identyfikatory są STAŁE. Nadaje je skrypty\generuj.py przy pierwszym pojawieniu się punktu
i zapisuje w skrypty\identyfikatory_punktow.json. Nowy punkt dostaje następny wolny numer
w swoim pomieszczeniu, a pozostałe numery się nie zmieniają, nawet gdy punkt zmieni
położenie albo typ. Numer usuniętego punktu nie zostanie użyty ponownie
(ODSWIEZ.bat to wypisze). Nie usuwaj pliku identyfikatory_punktow.json. Bez niego numery
zostałyby nadane od nowa, w kolejności czytania rzutu.
Gdyby obwody.json wskazywał punkt, którego już nie ma, aplikacja ostrzeże w panelu „Obwody”.

Usunięcie punktu (np. gniazdka z rysunku, którego w domu nie ma): w wymiary.ini, sekcja
[Punkty usunięte], dopisz linię  identyfikator = powód  (identyfikator z karty punktu, np.
lazienka-Z02 = nadmiarowe), potem ODSWIEZ.bat i – dla wersji w internecie – WYSLIJ_NA_GITHUB.bat.
Punkt znika z aplikacji, rzutu CAD i Blendera. Żeby go przywrócić, usuń tę linię.


OBWODY – plik obwody.json (przygotowanie pod wersję 2)
------------------------------------------------------
W wersji 1 aplikacja czyta ten plik, sprawdza go i pokazuje w karcie punktu opis i obwód.
Rysowanie tras kabli („gdzie nie wiercić”) będzie w wersji 2 – na tym samym pliku.

Układ współrzędnych jak w dane_modelu.json: centymetry,
  x – w prawo od wewnętrznego lica LEWEJ ściany domu,
  y – w dół rysunku od wewnętrznego lica GÓRNEJ ściany domu,
  z – wysokość nad podłogą.
Karta punktu pokazuje x i y każdego punktu (na licu ściany).

Budowa pliku (JSON – pilnuj cudzysłowów i przecinków; sekcja "_przyklad" to tylko wzór):

{
 "wersja": 1,
 "rozdzielnica": { "x": 600, "y": 900, "z": 150, "opis": "gdzie jest skrzynka" },   // albo null
 "ogrzewanie_podlogowe": {                    // warstwa w widoku 3D + ostrzeżenie w karcie punktu
   "pomieszczenia": "wszystkie",              //   albo lista, np. ["Łazienka", "Salon"]
   "uwagi": "nie wierć w posadzce …" },
 "osprzet": {                                 // osprzęt wg typu punktu, w karcie punktu (wewnątrz domu)
   "Z": { "nazwa": "Legrand Niloe Step, białe", "link": "https://…" },
   "W": { "nazwa": "Legrand Niloe Step, białe" }
 },
 "punkty": {                                  // dopiski do punktów (klucz = identyfikator)
   "kuchnia-Z06": { "opis": "potrójne przy rogu, nad blatem", "obwod": "K1" },
   "kuchnia-I01": { "osprzet": "gniazdo siłowe …" }   // inny osprzęt niż domyślny
 },
 "obwody": [                                  // obwody z rozdzielnicy
   { "id": "K1",
     "nazwa": "Kuchnia – gniazdka nad blatem",
     "zabezpieczenie": "B16",                 // bezpiecznik / wyłącznik w skrzynce
     "przewod": "YDYp 3x2,5",
     "kolor": "#e03131",                      // kolor obwodu na modelu (wersja 2)
     "punkty": ["kuchnia-Z06", "kuchnia-Z07"],
     "uwagi": "" }
 ],
 "trasy": [                                   // przebieg kabli: łamana wzdłuż ścian
   { "id": "T1",
     "obwod": "K1",
     "pewnosc": "szacunek",                   // pomiar | szacunek | z dokumentacji | nieznana
     "przewod": "YDYp 3x2,5",
     "punkty": [                              // kolejne załamania kabla
       { "punkt": "kuchnia-Z06" },            //   puszka (identyfikator punktu albo "rozdzielnica")
       [642.5, 42, 230],                      //   albo [x, y, z] w cm – na licu ściany
       [642.5, 215, 230],
       { "punkt": "kuchnia-Z08" }
     ],
     "uwagi": "pion z puszki do góry, potem poziomo 20 cm pod sufitem" }
 ]
}
(Komentarzy „//” nie wpisuj do pliku – JSON ich nie przyjmuje; tu są tylko dla wyjaśnienia.)

Wskazówki:
- Odcinki trasy prowadź pionowo albo poziomo wzdłuż ściany – tak zwykle biegną przewody.
- Lico ściany: współrzędna z karty punktu (np. ściana kuchni od strony biura: x = 642,5).
- "pewnosc" ważna przy wierceniu: trasa „szacunek” to tylko przypuszczenie.
- Punkt może być w "punkty" obwodu albo mieć "obwod" w sekcji "punkty" – wystarczy jedno.


PLIKI W TYM FOLDERZE
--------------------
URUCHOM.bat      – start (serwer + przeglądarka)
WYSLIJ_NA_GITHUB.bat – wysyła aplikację i aktualne dane na GitHub (wersja w internecie)
dane_modelu.json – kopia danych dla wersji w internecie (nadpisuje ją WYSLIJ_NA_GITHUB.bat;
                   nie edytuj ręcznie – źródłem jest wymiary.ini)
serwer.py        – mały serwer (Python, bez dodatkowych instalacji)
index.html       – strona aplikacji
styl.css         – wygląd
js\analiza.js    – liczenie pomieszczeń, ścian, odległości, identyfikatorów
js\budowa3d.js   – budowa modelu 3D (ta sama logika co skrypty\buduj_3d.py w Blenderze)
js\main.js       – widoki, warstwy, legenda, karta punktu, odświeżanie
js\sekcje.js     – menu oraz sekcje Instalacje, Ogrzewanie i Wyposażenie (z arkusza „MójDomek”)
js\konto.js      – przycisk konta, panel ze stanem wspólnej bazy i przenoszeniem zmian z rysunku
js\firebase.js   – połączenie z Firebase (logowanie, baza z kopią na urządzeniu)
js\dane\elementy.js – warstwa danych: elementy w bazie, porównanie z rysunkiem, zapis z wersją i historią
testy\           – testy warstwy danych bez przeglądarki: node --test testy\elementy.test.mjs
lib\             – Three.js 0.170 (licencja MIT, lib\LICENSE-three.txt)
obwody.json      – obwody i trasy kabli (na razie puste, z przykładem)
.gitignore, .nojekyll – ustawienia dla Gita i GitHub Pages (pliki ukryte)

Aplikacja nie zmienia żadnych plików poza swoim folderem – skrypty\dane_modelu.json tylko czyta
(WYSLIJ_NA_GITHUB.bat kopiuje go do tego folderu).
