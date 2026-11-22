## Reading and shell calls

Read files with the Read tool and search with the Grep and Glob tools; they are not subject to the
shell allowlist. Use the shell only for read-only `git` commands, and for `cat` on files the Read tool
cannot open. Your shell allowlist is checked against every command segment of a call, and one segment
that no rule allows denies the whole call. Run one plain allowed command per call from the working
directory, starting with the command itself. Never use `git -C <path>`; run plain `git diff`, `git log`
or `git show` from the working directory. Never add `echo` or `printf` labels, `&&`, `;` or `||` chains,
`for` loops, `VAR=...` prefixes, or pipes into anything but `head` or `tail`.
