## Shell calls

Your shell allowlist is checked against every command segment of a call, and one segment that no
rule allows denies the whole call. Run one plain allowed command per call from the working directory:
`cat`, `ls`, `head`, `tail`, `wc`, `grep`, `sed -n` or a read-only `git` command, each starting the call.
Never use `git -C <path>`; run plain `git diff`, `git log` or `git show` from the working directory.
Never add `echo` or `printf` labels, `&&`, `;` or `||` chains, `for` loops, `VAR=...` prefixes, or pipes
into anything but `head` or `tail`. To read several files, pass them to one `cat` or issue several calls
in the same turn.
