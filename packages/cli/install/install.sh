#!/usr/bin/env bash
set -euo pipefail

REPOSITORY="CloAI/CommaAgents"
VERSION="${COMMA_VERSION:-2.0.0-rc.0}"
VERSION="${VERSION#v}"
INSTALL_DIR="${COMMA_INSTALL_DIR:-$HOME/.local/bin}"

case "$(uname -s)" in
  Darwin) OS="darwin" ;;
  Linux) OS="linux" ;;
  *) echo "Unsupported operating system: $(uname -s)" >&2; exit 1 ;;
esac

case "$(uname -m)" in
  arm64|aarch64) ARCH="arm64" ;;
  x86_64|amd64) ARCH="x64" ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

LIBC=""
if [[ "$OS" == "linux" ]]; then
  if (ldd --version 2>&1 || true) | grep -qi musl; then
    LIBC="-musl"
  elif compgen -G '/lib/ld-musl-*.so.1' >/dev/null; then
    LIBC="-musl"
  fi
fi

ASSET="comma-${OS}-${ARCH}${LIBC}.tar.gz"
BASE_URL="https://github.com/${REPOSITORY}/releases/download/v${VERSION}"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT INT TERM

download() {
  local url="$1"
  local destination="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$destination"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$url" -O "$destination"
  else
    echo "curl or wget is required to install comma." >&2
    exit 1
  fi
}

download "$BASE_URL/$ASSET" "$TEMP_DIR/$ASSET"
download "$BASE_URL/SHA256SUMS" "$TEMP_DIR/SHA256SUMS"

EXPECTED="$(awk -v asset="$ASSET" '$2 == asset { print $1 }' "$TEMP_DIR/SHA256SUMS")"
if [[ -z "$EXPECTED" ]]; then
  echo "No checksum was published for $ASSET." >&2
  exit 1
fi
if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL="$(sha256sum "$TEMP_DIR/$ASSET" | awk '{ print $1 }')"
else
  ACTUAL="$(shasum -a 256 "$TEMP_DIR/$ASSET" | awk '{ print $1 }')"
fi
if [[ "$EXPECTED" != "$ACTUAL" ]]; then
  echo "Checksum verification failed for $ASSET." >&2
  exit 1
fi

tar -xzf "$TEMP_DIR/$ASSET" -C "$TEMP_DIR"
mkdir -p "$INSTALL_DIR"
install -m 755 "$TEMP_DIR/comma" "$INSTALL_DIR/.comma.new"
mv "$INSTALL_DIR/.comma.new" "$INSTALL_DIR/comma"

add_path_line() {
  local shell_file="$1"
  local line='export PATH="$HOME/.local/bin:$PATH"'
  touch "$shell_file"
  if ! grep -Fqx "$line" "$shell_file"; then
    printf '\n# CommaAgents CLI\n%s\n' "$line" >>"$shell_file"
    echo "Added $INSTALL_DIR to PATH in $shell_file"
  fi
}

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    if [[ "$INSTALL_DIR" == "$HOME/.local/bin" ]]; then
      case "${SHELL:-}" in
        */zsh) add_path_line "$HOME/.zshrc" ;;
        */bash)
          if [[ "$OS" == "darwin" ]]; then
            add_path_line "$HOME/.bash_profile"
          else
            add_path_line "$HOME/.bashrc"
          fi
          ;;
        */fish)
          if command -v fish >/dev/null 2>&1; then
            fish -c "fish_add_path --universal '$INSTALL_DIR'"
          fi
          ;;
        *) add_path_line "$HOME/.profile" ;;
      esac
    else
      echo "Add $INSTALL_DIR to PATH to run comma from a new shell."
    fi
    ;;
esac

export PATH="$INSTALL_DIR:$PATH"
if [[ -r /dev/tty ]]; then
  "$INSTALL_DIR/comma" install </dev/tty
else
  "$INSTALL_DIR/comma" install
fi
