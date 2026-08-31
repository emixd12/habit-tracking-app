"""Compare a signature-verified updater archive with the verified app, without extraction."""
import hashlib
import os
from pathlib import Path, PurePosixPath
import stat
import sys
import tarfile


def digest(stream):
    result = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
        result.update(chunk)
    return result.digest()


def app_manifest(app):
    entries = {}

    def visit(item, name):
        metadata = item.lstat()
        if item.is_symlink():
            entries[name] = ("symlink", item, metadata)
        elif item.is_dir():
            entries[name] = ("directory", item, metadata)
            for child in sorted(item.iterdir()):
                visit(child, name + "/" + child.name)
        elif item.is_file():
            entries[name] = ("file", item, metadata)
        else:
            raise ValueError("The verified app contains an unsupported filesystem entry.")

    visit(app, app.name)
    return entries


def verify(archive, app):
    expected = app_manifest(app)
    seen = set()
    with tarfile.open(archive, "r|gz") as bundle:
        for member in bundle:
            name = member.name.rstrip("/")
            normalized = PurePosixPath(name)
            if normalized.is_absolute() or ".." in normalized.parts or str(normalized) != name:
                raise ValueError("Unsafe archive path.")
            if name in seen:
                raise ValueError("Duplicate archive path.")
            seen.add(name)
            if name not in expected:
                raise ValueError("Unexpected archive path: " + name)
            kind, item, metadata = expected[name]
            if member.issym() and kind == "symlink":
                if member.linkname != os.readlink(item):
                    raise ValueError("Symlink target differs: " + name)
            elif member.isdir() and kind == "directory":
                pass
            elif member.isreg() and kind == "file":
                if member.size != metadata.st_size:
                    raise ValueError("File content differs: " + name)
                with bundle.extractfile(member) as archived, item.open("rb") as original:
                    if digest(archived) != digest(original):
                        raise ValueError("File content differs: " + name)
            else:
                # In particular, hard links and device entries never alias verified files.
                raise ValueError("Archive entry type differs: " + name)
            if kind != "symlink" and stat.S_IMODE(member.mode) != stat.S_IMODE(metadata.st_mode):
                raise ValueError("Archive permissions differ: " + name)
    if seen != set(expected):
        raise ValueError("The updater archive omits verified app paths.")


if __name__ == "__main__":
    try:
        if len(sys.argv) != 3:
            raise ValueError("Usage: verify-updater-archive.py archive.tar.gz Cadence.app")
        verify(Path(sys.argv[1]), Path(sys.argv[2]))
        print("Updater archive matches every verified app file, directory, permission, and symlink.")
    except (OSError, ValueError, tarfile.TarError) as error:
        print("Updater archive verification failed: " + str(error), file=sys.stderr)
        sys.exit(1)
