#!/usr/bin/env bash
# Instala o LibreOffice (sem interface gráfica) no SERVIDOR do backend. Rode uma vez: sudo bash scripts/instalar-libreoffice.sh
set -e
apt-get update
apt-get install -y --no-install-recommends libreoffice-writer fonts-liberation fonts-dejavu-core
soffice --version
