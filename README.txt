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

„Rzut z góry” – widok jak rysunek (bez perspektywy); przyciskiem obok wracasz do 3D.
⟲ – ustawia widok od nowa.
„Ujęcia kamer” – te same miejsca, z których zrobione są podglądy w Blenderze
                 (np. kuchnia z salonu, wiatrołap, pom. gospodarcze).

Warstwy (zaznacz/odznacz): ściany (z suwakiem wysokości – można je „przyciąć”, żeby
zajrzeć do środka), okna i drzwi, podłogi, sufity (każde pomieszczenie na swojej
wysokości, niebieskie płaszczyzny), belka, meble, sanitariaty, teren (siatka co 1 m),
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
 "punkty": {                                  // dopiski do punktów (klucz = identyfikator)
   "kuchnia-Z06": { "opis": "potrójne przy rogu, nad blatem", "obwod": "K1" }
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
lib\             – Three.js 0.170 (licencja MIT, lib\LICENSE-three.txt)
obwody.json      – obwody i trasy kabli (na razie puste, z przykładem)
.gitignore, .nojekyll – ustawienia dla Gita i GitHub Pages (pliki ukryte)

Aplikacja nie zmienia żadnych plików poza swoim folderem – skrypty\dane_modelu.json tylko czyta
(WYSLIJ_NA_GITHUB.bat kopiuje go do tego folderu).
