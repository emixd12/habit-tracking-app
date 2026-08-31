"""Inspect a DMG read-only and compare its app without launching it or changing quarantine."""
import hashlib
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile


def app_manifest(app):
    entries = {}

    def visit(item, name):
        metadata = item.lstat()
        mode = stat.S_IMODE(metadata.st_mode)
        if item.is_symlink():
            entries[name] = ("symlink", os.readlink(item))
        elif item.is_dir():
            entries[name] = ("directory", mode)
            for child in sorted(item.iterdir()):
                visit(child, name + "/" + child.name)
        elif item.is_file():
            digest = hashlib.sha256()
            with item.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(chunk)
            entries[name] = ("file", mode, metadata.st_size, digest.hexdigest())
        else:
            raise ValueError("An application contains an unsupported filesystem entry.")

    if app.is_symlink() or not app.is_dir():
        raise ValueError("The application must be a regular directory.")
    visit(app, app.name)
    return entries


def compare_apps(expected, actual):
    if app_manifest(expected) != app_manifest(actual):
        raise ValueError("The DMG application differs from the verified app.")


def verify_volume_layout(mount, app_name):
    allowed = {app_name, "Applications", ".VolumeIcon.icns", ".DS_Store"}
    if any(item.name not in allowed for item in mount.iterdir()):
        raise ValueError("The DMG contains unexpected files outside its app and packaging metadata.")
    for name in [".VolumeIcon.icns", ".DS_Store"]:
        item = mount / name
        if item.exists() or item.is_symlink():
            if not stat.S_ISREG(item.lstat().st_mode):
                raise ValueError("DMG packaging metadata must be regular files.")
    applications = mount / "Applications"
    if not applications.is_symlink() or os.readlink(applications) != "/Applications":
        raise ValueError("The DMG Applications link is invalid.")


def run(args):
    result = subprocess.run(args, capture_output=True, check=False)
    if result.returncode:
        raise ValueError(Path(args[0]).name + " " + args[1] + " failed.")


def verify(dmg, app):
    run(["/usr/bin/hdiutil", "verify", str(dmg)])
    mount = Path(tempfile.mkdtemp(prefix="cadence-dmg-readonly-"))
    attached = False
    try:
        run(["/usr/bin/hdiutil", "attach", "-readonly", "-nobrowse", "-noautoopen",
             "-mountpoint", str(mount), str(dmg)])
        attached = True
        if not os.statvfs(mount).f_flag & os.ST_RDONLY:
            raise ValueError("The DMG is not mounted read-only.")
        verify_volume_layout(mount, app.name)
        mounted_app = mount / app.name
        compare_apps(app, mounted_app)
        run(["/usr/bin/codesign", "--verify", "--deep", "--strict", str(mounted_app)])
    finally:
        if attached:
            run(["/usr/bin/hdiutil", "detach", str(mount)])
        mount.rmdir()


if __name__ == "__main__":
    try:
        if len(sys.argv) != 3:
            raise ValueError("Usage: verify-dmg.py candidate.dmg Cadence.app")
        verify(Path(sys.argv[1]), Path(sys.argv[2]))
        print("Read-only DMG verification passed; its app matches every verified file, permission, and symlink. No launch occurred.")
    except (OSError, ValueError) as error:
        print("DMG verification failed: " + str(error), file=sys.stderr)
        sys.exit(1)
