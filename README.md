# scripter

runs javascript and bash scripts in sequence.

## arch linux

to install arch linux from a live disk, run the following:

1. `pacman -Sy nodejs npm git`
2. `git clone https://github.com/deadpeer/scripter && cd scripter`
3. `npm run install:arch`

or as a oneliner:

`unsetopt correct_all && pacman -Sy --noconfirm nodejs npm git && git clone https://github.com/deadpeer/scripter && cd scripter && npm run install:arch`
