#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
A stand-in ESC/POS receipt printer.

Every network receipt printer is just a raw TCP socket on port 9100 that
swallows whatever bytes you send it. So this script IS a printer, as far
as the app can tell: point the app's printer settings at this machine and
every receipt, kitchen ticket and drawer-kick lands here instead of on
paper.

That exercises the whole chain -- the iOS Local Network permission, the
Network.framework socket in NetworkPrinterTransport.swift, the print
queue, the ESC/POS builder and the raster encoder -- with no hardware at
all. The only thing it does not prove is the printer's own paper
handling.

    python tools/fake-printer.py

Each job is saved verbatim next to this script under received/, and
decoded to the terminal so you can read the Arabic and see which ESC/POS
commands were emitted.
"""

import datetime
import os
import socket
import sys

# The Windows console defaults to a legacy codepage that cannot encode
# Arabic, so printing a decoded receipt raised UnicodeEncodeError and took
# the whole listener down mid-job. Force UTF-8 on our own output instead.
for _stream in (sys.stdout, sys.stderr):
    try:
        # line_buffering matters as much as the encoding here: this tool is
        # meant to be watched live while you tap around the app, and a
        # block-buffered stdout shows nothing until the buffer fills or the
        # process exits.
        _stream.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
    except (AttributeError, OSError):
        pass

PORT = 9100
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'received')

# (sequence, label, trailing argument bytes). The argument count matters:
# without it the numeric operands after ESC d / GS V / ESC p fall through to
# the text decoder and print as stray mojibake between the commands.
COMMANDS = [
    (b'\x1d\x76\x30', 'GS v 0   raster image (logo / QR)', 0),  # header handled below
    (b'\x1b\x40', 'ESC @    initialise printer', 0),
    (b'\x1b\x61\x00', 'ESC a 0  align left', 0),
    (b'\x1b\x61\x01', 'ESC a 1  align centre', 0),
    (b'\x1b\x61\x02', 'ESC a 2  align right', 0),
    (b'\x1b\x45\x01', 'ESC E 1  bold on', 0),
    (b'\x1b\x45\x00', 'ESC E 0  bold off', 0),
    (b'\x1d\x21', 'GS !     text size', 1),
    (b'\x1b\x64', 'ESC d    feed lines', 1),
    (b'\x1d\x56', 'GS V     CUT PAPER', 1),
    (b'\x1b\x70', 'ESC p    OPEN CASH DRAWER', 3),
    (b'\x1b\x74', 'ESC t    select codepage', 1),
]


def local_ips():
    ips = []
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith('127.') and ip not in ips:
                ips.append(ip)
    except socket.gaierror:
        pass
    if not ips:
        # Fallback: ask the OS which interface would reach the internet.
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(('8.8.8.8', 80))
            ips.append(s.getsockname()[0])
        except OSError:
            pass
        finally:
            s.close()
    return ips


def describe(data: bytes) -> None:
    """Print a readable rendering: commands named, text decoded."""
    found = []
    i = 0
    text_run = bytearray()

    def flush_text():
        if not text_run:
            return
        # Order matters. cp864 maps all 256 byte values, so it never
        # raises and would always "win" -- including on UTF-8 input, which
        # it renders as mojibake. UTF-8 is strict enough to rule itself
        # out, so it goes first; cp1256 next (it has undefined slots, so
        # it can also fail honestly); cp864 last as the catch-all.
        for enc in ('utf-8', 'cp1256', 'cp864'):
            try:
                decoded = text_run.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        else:
            decoded = text_run.decode('latin-1', 'replace')
        for line in decoded.splitlines():
            if line.strip():
                print('    | ' + line)
        text_run.clear()

    while i < len(data):
        for seq, name, nargs in COMMANDS:
            if data.startswith(seq, i):
                flush_text()
                print('    <' + name + '>')
                found.append(name)
                i += len(seq) + nargs
                # GS v 0 carries a 5-byte header then a raster bitmap; skip
                # it rather than trying to decode the pixels as text.
                if seq == b'\x1d\x76\x30' and i + 5 <= len(data):
                    xl, xh, yl, yh = data[i + 1:i + 5]
                    width_bytes = xl + xh * 256
                    height = yl + yh * 256
                    size = width_bytes * height
                    print(f'      raster {width_bytes * 8}x{height}px, {size} bytes')
                    i += 5 + size
                break
        else:
            text_run.append(data[i])
            i += 1
    flush_text()

    if any('CUT PAPER' in f for f in found):
        print('    -> paper cut requested (a real printer would cut here)')
    if any('CASH DRAWER' in f for f in found):
        print('    -> DRAWER KICK requested')


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)

    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    # NOT SO_REUSEADDR on Windows. There, SO_REUSEADDR does not mean what
    # it means on Unix: it lets a SECOND process bind a port that is
    # already bound, and incoming connections then go to one of them.
    # That is how a whole debugging session got spent on a print job the
    # app really did deliver -- an older listener owned the port and was
    # writing every receipt to disk, while the window being watched showed
    # nothing but its own banner. SO_EXCLUSIVEADDRUSE makes the second
    # instance fail loudly instead, which is the only useful behaviour for
    # a tool whose entire job is to tell you what arrived.
    if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
        server.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
    else:
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        server.bind(('0.0.0.0', PORT))
    except OSError as e:
        print(f'Could not listen on port {PORT}: {e}')
        print('Another listener already owns it. Find out which:')
        print('  PowerShell:  Get-NetTCPConnection -LocalPort 9100 -State Listen |')
        print('               Select-Object OwningProcess')
        print('  then:        Get-CimInstance Win32_Process -Filter "ProcessId = <pid>" |')
        print('               Select-Object CommandLine, CreationDate')
        print('THAT process is the one receiving your print jobs, not this window.')
        return 1
    server.listen(5)

    print('=' * 62)
    print('  Fake ESC/POS printer is listening'.center(62))
    print('=' * 62)
    # Identify the window. With several terminals open it is otherwise
    # impossible to tell which one actually owns the socket -- and a
    # listener that is not the owner looks exactly like a printer that
    # never received anything.
    print('')
    print(f'  PID {os.getpid()} -- THIS window owns port {PORT}.')
    print(f'  Jobs are saved to {OUT_DIR}')
    ips = local_ips()
    if ips:
        print('\n  In the app: Settings -> Printer')
        print('    Transport : Network')
        for ip in ips:
            print(f'    Host      : {ip}')
        print(f'    Port      : {PORT}')
    print('\n  The phone must be on the SAME Wi-Fi as this machine.')
    print('  Windows Firewall will block this until you allow the port')
    print('  (see the README next to this file).')
    print('\n  Ctrl+C to stop.\n')

    job = 0
    try:
        while True:
            conn, addr = server.accept()
            job += 1
            stamp = datetime.datetime.now().strftime('%H:%M:%S')
            print(f'--- job {job} from {addr[0]} at {stamp} ' + '-' * 18)
            chunks = []
            conn.settimeout(5)
            try:
                while True:
                    chunk = conn.recv(8192)
                    if not chunk:
                        break
                    chunks.append(chunk)
            except socket.timeout:
                pass
            finally:
                conn.close()

            data = b''.join(chunks)
            if not data:
                # This is what "اختبار الاتصال" looks like: it opens the
                # socket to prove it can reach the printer, then closes it
                # without sending a job. Connecting at all is the pass.
                print('    (connected, sent nothing -- this is the connection test)')
                print('    CONNECTION TEST PASSED\n')
                continue

            path = os.path.join(OUT_DIR, f'job-{job:03d}.bin')
            with open(path, 'wb') as fh:
                fh.write(data)
            print(f'    {len(data)} bytes -> {os.path.relpath(path)}')
            describe(data)
            print()
    except KeyboardInterrupt:
        print('\nStopped.')
    finally:
        server.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
