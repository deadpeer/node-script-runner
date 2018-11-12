const fs = require('fs')

const run = require('../../lib/scripter')

const secrets = JSON.parse(fs.readFileSync('/root/install/secrets.json', 'utf-8').toString())

const steps = [
  {
    name: 'remove secrets.json',
    type: 'shell',
    instructions: {
      command: 'rm',
      args: ['/root/install/secrets.json'],
    },
  },

  {
    name: 'set time zone',
    type: 'shell',
    instructions: {
      command: 'timedatectl',
      args: [
        'set-timezone',
        secrets.timeZone,
      ],
    },
  },

  {
    name: 'set hardware clock',
    type: 'shell',
    instructions: {
      command: 'hwclock',
      args: ['--systohc'],
    },
  },

  {
    name: 'set ntp',
    type: 'shell',
    instructions: {
      command: 'systemctl',
      args: [
        'enable',
        'ntpd',
      ],
    },
  },

  {
    name: 'set localization',
    type: 'shell',
    instructions: {
      command: 'sh',
      args: [
        '-c',
        'echo "en_US.UTF-8 UTF-8" > /etc/locale.gen',
      ],
    },
  },

  {
    name: 'generate locales',
    type: 'shell',
    instructions: { command: 'locale-gen' },
  },

  {
    name: 'set hostname',
    type: 'shell',
    instructions: {
      command: 'sh',
      args: [
        '-c',
        `echo "${secrets.hostname}" > /etc/hostname`,
      ],
    },
  },

  {
    name: 'set /etc/hosts',
    type: 'shell',
    instructions: {
      command: 'sh',
      args: [
        '-c',
        'echo "127.0.0.1\tlocalhost" > /etc/hosts',
      ],
    },
  },

  {
    name: 'set root permissions in sudoers',
    type: 'shell',
    instructions: {
      command: 'sh',
      args: [
        '-c',
        'echo "root All=(ALL) ALL" > /etc/sudoers',
      ],
    },
  },

  {
    name: 'set wheel permissions in sudoers',
    type: 'shell',
    instructions: {
      command: 'sh',
      args: [
        '-c',
        'echo "%wheel ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers',
      ],
    },
  },

  {
    name: 'create hooks directory for pacman',
    type: 'shell',
    instructions: {
      command: 'mkdir',
      args: ['/etc/pacman.d/hooks'],
    },
  },

  {
    name: 'create reflector hook',
    type: 'script',
    instructions: {
      script: () => {
        const content = 
`[Trigger]
Operation = Upgrade
Type = Package
Target = pacman-mirrorlist

[Action]
Description = Updating pacman-mirrorlist with reflector and removing pacnew...
When = PostTransaction
Depends = reflector
Exec = /bin/sh -c 'reflector --latest 200 --protocol https --sort rate --age 24 --save /etc/pacman.d/mirrorlist; rm -f /etc/pacman.d/mirrorlist.pacnew'`

        fs.writeFileSync('/etc/pacman.d/hooks/mirror-upgrade.hook', content, 'utf-8')
      },
    },
  },

  {
    name: 'create nvidia hook',
    type: 'script',
    conditional: secrets.nvidia === true,
    instructions: {
      script: () => {
        const content = 
`[Trigger]
Operation = Install
Operation = Upgrade
Operation = Remove
Type = Package
Target = nvidia
Target = linux

[Action]
Description = Updating NVIDIA module in initcpio...
Depends = mkinitcpio
When = PostTransaction
NeedsTargets
Exec = /bin/sh -c 'while read -r trg; do case $trg in linux) exit 0; esac; done; /usr/bin/mkinitcpio -P'`

        fs.writeFileSync('/etc/pacman.d/hooks/nvidia.hook', content, 'utf-8')
      },
    },
  },

  {
    name: 'write pacman config',
    type: 'script',
    instructions: {
      script: () => {
        const content = 
`[options]
HoldPkg = pacman glibc
Architecture = auto
Color
CheckSpace
SigLevel = Required DatabaseOptional
LocalFileSigLevel = Optional
ILoveCandy

[testing]
Include = /etc/pacman.d/mirrorlist

[core]
Include = /etc/pacman.d/mirrorlist

[extra]
Include = /etc/pacman.d/mirrorlist

[community-testing]
Include = /etc/pacman.d/mirrorlist

[community]
Include = /etc/pacman.d/mirrorlist

[multilib-testing]
Include = /etc/pacman.d/mirrorlist

[multilib]
Include = /etc/pacman.d/mirrorlist`

        fs.writeFileSync('/etc/pacman.conf', content, 'utf-8')
      },
    },
  },

  {
    name: 'update pacman',
    type: 'shell',
    instructions: {
      command: 'pacman',
      args: [
        '-Syyu',
        '--noconfirm',
      ],
      onOutput: [
        {
          perform: ({ output }) => console.log(output),
        },
      ],
    },
  },

  {
    name: 'install open source A/V drivers',
    type: 'shell',
    conditional: secrets.xorg === true,
    instructions: {
      command: 'pacman',
      args: [
        '-S',
        '--noconfirm',
        'xf86-video-fbdev',
        'xf86-video-vesa',
        'pulseaudio',
        'mesa',
      ],
      onOutput: [
        {
          perform: ({ output }) => console.log(output),
        },
      ],
    },
  },

  {
    name: 'install nvidia driver',
    type: 'shell',
    conditional: secrets.nvidia === true,
    instructions: {
      command: 'pacman',
      args: [
        '-S',
        '--noconfirm',
        'nvidia',
        'nvidia-utils',
      ],
      onOutput: [
        {
          perform: ({ output }) => console.log(output),
        },
      ],
    },
  },

  {
    name: 'install xorg',
    type: 'shell',
    conditional: secrets.xorg === true,
    instructions: {
      command: 'pacman',
      args: [
        '-S',
        '--noconfirm',
        'xorg-server',
        'xorg-xinit',
        'xorg-apps',
      ],
      onOutput: [
        {
          perform: ({ output }) => console.log(output),
        },
      ],
    },
  },

  {
    name: 'install virtualbox guest packages',
    type: 'shell',
    conditional: secrets.vbox === true,
    instructions: {
      command: 'pacman',
      args: [
        '-S',
        '--noconfirm',
        secrets.vboxGfx === true ? 'virtualbox-guest-utils-nox' : 'virtualbox-guest-utils',
        'virtualbox-guest-modules-arch',
      ],
      onOutput: [
        {
          perform: ({ output }) => console.log(output),
        },
      ],
    },
  },
  {
    name: 'enable virtualbox services',
    type: 'shell',
    conditional: secrets.vbox === true,
    instructions: {
      command: 'systemctl',
      args: [
        'enable',
        'vboxservice',
      ],
    },
  },

  {
    name: 'set nvidia config',
    type: 'shell',
    conditional: secrets.nvidia === true,
    instructions: { command: 'nvidia-xconfig' },
  },

  {
    name: 'set mkinitcpio config',
    type: 'script',
    instructions: {
      script: () => {
        const content = 
`MODULES=()
BINARIES=()
FILES=()
HOOKS=(base udev autodetect keyboard keymap consolefont modconf block lvm2 encrypt filesystems fsck)`

        fs.writeFileSync('/etc/mkinitcpio.conf', content, 'utf-8')
      },
    },
  },

  {
    name: 'run mkinitcpio',
    type: 'shell',
    instructions: {
      command: 'mkinitcpio',
      args: [
        '-p',
        'linux',
      ],
      onOutput: [
        {
          perform: ({ output }) => console.log(output),
        },
      ],
    },
  },

  {
    name: 'set root password',
    type: 'shell',
    instructions: {
      command: 'sh',
      args: [
        '-c',
        `echo "root:${secrets.rootPassword}" | chpasswd`,
      ],
    },
  },

  {
    name: `create user '${secrets.userName}'`,
    type: 'shell',
    instructions: {
      command: 'useradd',
      args: [
        '-m',
        '-g',
        'wheel',
        '-s',
        '/bin/zsh',
        secrets.userName,
      ],
    },
  },

  {
    name: `set user '${secrets.userName}' password`,
    type: 'shell',
    instructions: {
      command: 'sh',
      args: [
        '-c',
        `echo "${secrets.userName}:${secrets.rootPassword}" | chpasswd`,
      ],
    },
  },

  {
    name: 'install pikaur',
    type: 'shell',
    instructions: {
      command: 'su',
      args: [
        secrets.userName,
        '-c',
        `cd /home/${secrets.userName} && git clone https://aur.archlinux.org/pikaur.git && cd pikaur && makepkg -fsri --noconfirm && rm -rf /home/${secrets.userName}/pikaur`,
      ],
      onOutput: [
        {
          perform: ({ output }) => console.log(output),
        },
      ],
    },
  },

  {
    name: `clean up .bashrc for user '${secrets.userName}'`,
    type: 'shell',
    instructions: {
      command: 'rm',
      args: [
        '-f',
        `/home/${secrets.userName}/.bashrc`,
      ],
    },
  },

  {
    name: `clean up .bash_profile for user '${secrets.userName}'`,
    type: 'shell',
    instructions: {
      command: 'rm',
      args: [
        '-rf',
        `/home/${secrets.userName}/.bash_profile`,
      ],
    },
  },

  {
    name: `clean up .bash_logout for user '${secrets.userName}'`,
    type: 'shell',
    instructions: {
      command: 'rm',
      args: [
        '-rf',
        `/home/${secrets.userName}/.bash_logout`,
      ],
    },
  },

  {
    name: `write .zshrc for user '${secrets.userName}'`,
    type: 'script',
    instructions: {
      script: () => {
        const content = 
`EDITOR=vim
PROMPT='%n@%m %3~%(!.#.$)%(?.. [%?]) '
HISTFILE=~/.zsh-history
HISTSIZE=10000
SAVEHIST=10000
setopt append_history
setopt auto_menu
setopt autocd
setopt bang_hist
setopt complete_in_word
setopt extended_history
setopt hist_expire_dups_first
setopt hist_find_no_dups
setopt hist_ignore_dups
setopt hist_ignore_space
setopt hist_reduce_blanks
setopt inc_append_history
setopt interactive_comments
setopt share_history
setopt vi
unsetopt correct_all
autoload -Uz compinit && compinit
ZLE_REMOVE_SUFFIX_CHARS=$' \\t\\n;&'`

        fs.writeFileSync(`/home/${secrets.userName}/.zshrc`, content, 'utf-8')
      },
    },
  },

  {
    name: 'set grub config defaults',
    type: 'script',
    instructions: {
      script: () => {
        const content = 
`GRUB_DEFAULT=0
GRUB_TIMEOUT=5
GRUB_DISTRIBUTOR="Arch"
GRUB_CMDLINE_LINUX_DEFAULT="quiet"
GRUB_CMDLINE_LINUX="cryptdevice=/dev/main/root:root root=/dev/mapper/root"
GRUB_PRELOAD_MODULES="part_msdos"
GRUB_TERMINAL_INPUT=console
GRUB_GFXMODE=1024x768x32
GRUB_GFXPAYLOAD_LINUX=keep
GRUB_COLOR_NORMAL="light-blue/black"
GRUB_COLOR_HIGHLIGHT="light-cyan/blue"
GRUB_DISABLE_RECOVERY=true
GRUB_ENABLE_CRYPTODISK=y`

        fs.writeFileSync('/etc/default/grub', content, 'utf-8')
      },
    },
  },

  {
    name: 'install grub',
    type: 'shell',
    instructions: {
      command: 'grub-install',
      args: [
        '--target=i386-pc',
        '--recheck',
        secrets.device.name,
      ],
      onOutput: [
        {
          perform: ({ output }) => console.log(output),
        },
      ],
    },
  },

  {
    name: 'make grub config',
    type: 'shell',
    instructions: {
      command: 'grub-mkconfig',
      args: [
        '-o',
        '/boot/grub/grub.cfg',
      ],
      onOutput: [
        {
          perform: ({ output }) => console.log(output),
        },
      ],
    },
  },

  {
    name: 'enable dhcp service',
    type: 'shell',
    instructions: {
      command: 'systemctl',
      args: [
        'enable',
        'dhcpcd',
      ],
    },
  },
  
  {
    name: 'set terminal font',
    type: 'shell',
    instructions: {
      command: 'sh',
      args: [
        '-c',
        'echo "FONT=ter-116n" > /etc/vconsole.conf',
      ],
    },
  },
  
    {
    name: 'set terminal font map',
    type: 'shell',
    instructions: {
      command: 'sh',
      args: [
        '-c',
        'echo "FONT=ter-116n" >> /etc/vconsole.conf',
      ],
    },
  },

  {
    name: `copy install directory to ~/.configure for user '${secrets.userName}'`,
    type: 'shell',
    instructions: {
      command: 'cp',
      args: [
        '-r',
        '/root/install',
        `/home/${secrets.userName}/.configure`,
      ],
    },
  },

  {
    name: `set ownership on home directory for user '${secrets.userName}'`,
    type: 'shell',
    instructions: {
      command: 'chown',
      args: [
        '-R',
        `${secrets.userName}:wheel`,
        `/home/${secrets.userName}`,
      ],
    },
  },

  {
    name: `set permissions on home directory for user '${secrets.userName}'`,
    type: 'shell',
    instructions: {
      command: 'chmod',
      args: [
        '-R',
        '700',
        `/home/${secrets.userName}`,
      ],
    },
  },

  {
    name: 'clean up install directory for root',
    type: 'shell',
    instructions: {
      command: 'rm',
      args: [
        '-rf',
        '/root/install',
      ],
    },
  },

  {
    name: 'clean up .config directory for root',
    type: 'shell',
    instructions: {
      command: 'rm',
      args: [
        '-rf',
        '/root/.config',
      ],
    },
  },

  {
    name: 'clean up .npm directory for root',
    type: 'shell',
    instructions: {
      command: 'rm',
      args: [
        '-rf',
        '/root/.npm',
      ],
    },
  },

  {
    name: 'clean up .gnupg directory for root',
    type: 'shell',
    instructions: {
      command: 'rm',
      args: [
        '-rf',
        '/root/.gnupg',
      ],
    },
  },
]

run(steps)
