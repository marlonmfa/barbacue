#!/usr/bin/env python3
"""Build a private routing index from IBGE CNEFE 2022 municipal CSVs."""
import csv
import hashlib
import io
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path
from urllib.request import urlopen
from zipfile import ZipFile

BASE = ("https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/"
        "Censo_Demografico_2022/Arquivos_CNEFE/CSV/Municipio/42_SC/")
MUNICIPALITIES = {
    "4204509_CORUPA": "corupa",
    "4206504_GUARAMIRIM": "guaramirim",
    "4208906_JARAGUA_DO_SUL": "jaragua do sul",
    "4210605_MASSARANDUBA": "massaranduba",
    "4217402_SCHROEDER": "schroeder",
}


def normalize(value):
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", ascii_value).strip()


def main(directory):
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    entries = defaultdict(set)
    provenance = {}
    for name, city in MUNICIPALITIES.items():
        path = directory / (name + ".zip")
        if not path.exists():
            with urlopen(BASE + path.name, timeout=60) as response:
                data = response.read(40_000_001)
            if len(data) > 40_000_000:
                raise ValueError("CNEFE archive exceeded expected size")
            path.write_bytes(data)
        provenance[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
        with ZipFile(path) as archive, archive.open(name + ".csv") as raw:
            records = csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig"), delimiter=";")
            for row in records:
                if row["NV_GEO_COORD"] not in {"1", "2"}:
                    continue
                number = row["NUM_ENDERECO"].strip()
                if not re.fullmatch(r"[0-9]{1,7}", number) or int(number) == 0:
                    continue
                street = normalize(" ".join(row[key] for key in ("NOM_TIPO_SEGLOGR", "NOM_TITULO_SEGLOGR", "NOM_SEGLOGR")))
                if not street:
                    continue
                latitude, longitude = float(row["LATITUDE"]), float(row["LONGITUDE"])
                if not (-26.73 < latitude < -26.31 and -49.35 < longitude < -48.91):
                    continue
                postal = re.sub(r"\D", "", row["CEP"])
                suffix = normalize(row["DSC_MODIFICADOR"])
                suffix = "" if suffix in {"", "null", "nenhum", "nao informado"} else suffix
                entries[f"{street}|{int(number)}"].add((city, postal, suffix, round(latitude, 6), round(longitude, 6)))

    output = directory / "address-index.json"
    temporary = output.with_suffix(".tmp")
    with temporary.open("w", encoding="utf-8") as file:
        json.dump({key: sorted(values) for key, values in sorted(entries.items())}, file, separators=(",", ":"))
    temporary.replace(output)
    (directory / "address-index-provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print(f"{len(entries)} combinações de logradouro e número em {len(MUNICIPALITIES)} municípios.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(f"Uso: {sys.argv[0]} DIRETORIO")
    main(Path(sys.argv[1]))
