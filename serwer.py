# -*- coding: utf-8 -*-
"""Mój domek – mały serwer do podglądu 3D.

Udostępnia TYLKO folder aplikacji oraz plik skrypty/dane_modelu.json (pod adresem
/skrypty/dane_modelu.json). Nic innego z folderu Projekt nie jest widoczne.

Użycie:  python serwer.py                 – serwer w sieci domowej (komputer + telefon)
         python serwer.py --lokalnie      – tylko ten komputer
         python serwer.py --port 8800     – inny port
         python serwer.py --bez-przegladarki
         python serwer.py --dane C:\\kopia\\dane_modelu.json   – inny plik danych (do testów)
"""
import argparse
import http.server
import os
import socket
import sys
import webbrowser
from urllib.parse import unquote, urlparse

APP = os.path.dirname(os.path.abspath(__file__))
DANE = os.path.normpath(os.path.join(APP, "..", "skrypty", "dane_modelu.json"))
TYPY = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
}
UKRYTE = {"serwer.py", "uruchom.bat", "wyslij_na_github.bat"}


class Obsluga(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=APP, **kw)

    def translate_path(self, path):
        p = unquote(urlparse(path).path)
        if p == "/skrypty/dane_modelu.json":
            return DANE
        return super().translate_path(path)

    def send_head(self):
        p = unquote(urlparse(self.path).path)
        czesci = [c for c in p.replace("\\", "/").split("/") if c]
        # bez plików ukrytych (np. .git z historią repozytorium) i plików startowych
        if any(c.startswith(".") for c in czesci) or os.path.basename(p).lower() in UKRYTE:
            self.send_error(404)
            return None
        return super().send_head()

    def list_directory(self, path):          # bez spisu plików
        self.send_error(404)
        return None

    def guess_type(self, path):              # nie ufamy rejestrowi Windows (.js bywa tam text/plain)
        return TYPY.get(os.path.splitext(path)[1].lower(), "application/octet-stream")

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def log_message(self, fmt, *args):       # cicho – tylko błędy
        if len(args) > 1 and str(args[1])[:1] in "45":
            sys.stderr.write("  ! %s %s\n" % (args[1], args[0]))


def adresy_lan():
    """Adresy tego komputera w sieci; pierwszy = ten, przez który idzie ruch do sieci domowej."""
    glowny = None
    try:   # UDP „connect” nic nie wysyła – tylko wybiera kartę sieciową z trasą
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            glowny = s.getsockname()[0]
    except OSError:
        pass
    inne = set()
    try:
        for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
            if not ip.startswith("127.") and not ip.startswith("169.254."):
                inne.add(ip)
    except OSError:
        pass
    if glowny and not glowny.startswith("127."):
        inne.discard(glowny)
        return [glowny] + sorted(inne)
    return sorted(inne)


def main():
    ap = argparse.ArgumentParser(description="Mój domek – serwer podglądu 3D")
    ap.add_argument("--port", type=int, default=8642)
    ap.add_argument("--lokalnie", action="store_true", help="tylko ten komputer (bez telefonu)")
    ap.add_argument("--bez-przegladarki", action="store_true")
    ap.add_argument("--dane", help="inny plik dane_modelu.json (np. do testów)")
    a = ap.parse_args()
    global DANE
    if a.dane:
        DANE = os.path.abspath(a.dane)

    if not os.path.exists(DANE):
        print("UWAGA: brak pliku", DANE)
        print("       Uruchom najpierw ODSWIEZ.bat w folderze Projekt.\n")

    host = "127.0.0.1" if a.lokalnie else "0.0.0.0"
    serwer = None
    for port in range(a.port, a.port + 10):
        try:
            serwer = http.server.ThreadingHTTPServer((host, port), Obsluga)
            break
        except OSError:
            continue
    if serwer is None:
        print("Nie udało się uruchomić serwera (porty %d–%d są zajęte)." % (a.port, a.port + 9))
        return 1
    port = serwer.server_address[1]
    lokalny = "http://localhost:%d/" % port

    print("MÓJ DOMEK – podgląd 3D")
    print("----------------------")
    print("Na tym komputerze:  " + lokalny)
    if not a.lokalnie:
        lan = adresy_lan()
        if lan:
            print("Na telefonie (ta sama sieć Wi-Fi):  http://%s:%d/" % (lan[0], port))
        if len(lan) > 1:
            print("  (gdyby nie działało – inne adresy tego komputera: %s)" % ", ".join(lan[1:]))
        if not lan:
            print("(Nie znalazłem adresu w sieci domowej – telefon może nie mieć dostępu.)")
    print("\nDane: " + DANE)
    print("Po ODSWIEZ.bat aplikacja sama wczyta nowe dane.")
    print("Zamknij to okno (albo Ctrl+C), żeby wyłączyć podgląd.\n")
    sys.stdout.flush()

    if not a.bez_przegladarki:
        webbrowser.open(lokalny)
    try:
        serwer.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        serwer.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
