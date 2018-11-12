const https = require('https')
const fs = require('fs')

const run = require('../../lib/scripter')

// TODO: add '(SKIP)' to names for items that don't pass conditional
// TODO: prompt for GPT or MBR
// TODO: prompt for zeroing disk, else partition accordingly (ask user if they're sure they want to delete everything on disk)

const steps = [
  {
    name: 'get hostname',
    type: 'read',
    instructions: {
      query: 'enter a hostname:',
      onResponse: ({
        response,
        state,
      }) => state.hostname = response,
    },
  },

  {
    name: 'get boot partition password',
    type: 'read',
    instructions: {
      silent: true,
      query: 'enter a password for the boot partition:',
      onResponse: ({
        response,
        state,
      }) => state.partitionBootPassword = response,
    },
  },

  {
    name: 'get root partition password',
    type: 'read',
    instructions: {
      silent: true,
      query: 'enter a password for the root partition:',
      onResponse: ({
        response,
        state,
      }) => state.partitionRootPassword = response,
    },
  },

  {
    name: 'get root user password',
    type: 'read',
    instructions: {
      silent: true,
      query: 'enter a password for the root user:',
      onResponse: ({
        response,
        state,
      }) => state.rootPassword = response,
    },
  },

  {
    name: 'get user name',
    type: 'read',
    instructions: {
      query: 'enter a name for your user:',
      onResponse: ({
        response,
        state,
      }) => state.userName = response,
    },
  },

  {
    name: 'get user password',
    type: 'read',
    instructions: {
      silent: true,
      query: state => `enter a password for user '${state.userName}':`,
      onResponse: ({
        response,
        state,
      }) => state.userPassword = response,
    },
  },

  {
    name: 'install xorg',
    type: 'read',
    instructions: {
      query: 'install xorg display server? (y/n):',
      defaultValue: 'y',
      onResponse: ({
        response,
        state,
      }) => {
        const choice = response.toLowerCase()

        if (choice === 'y' || choice === 'ye' || choice === 'yes') {
          state.xorg = true
        } else {
          state.xorg = false
        }
      },
    },
  },

  {
    name: 'install nvidia driver',
    type: 'read',
    conditional: state => state.xorg === true,
    instructions: {
      query: 'install nvidia driver? (y/n):',
      defaultValue: 'n',
      onResponse: ({
        response,
        state,
      }) => {
        const choice = response.toLowerCase()

        if (choice === 'y' || choice === 'ye' || choice === 'yes') {
          state.nvidia = true
        } else {
          state.nvidia = false
        }
      },
    },
  },

  {
    name: 'install virtualbox guest packages',
    type: 'read',
    instructions: {
      query: 'is this a virtualbox guest? (y/n):',
      defaultValue: 'n',
      onResponse: ({
        response,
        state,
      }) => {
        if (choice === 'y' || choice === 'ye' || choice === 'yes') {
          state.vbox = true
          state.vboxGfx = state.xorg ? true : false
        } else {
          state.vbox = false
          state.vboxGfx = false
        }
      },
    },
  },

  {
    name: 'reboot on finish',
    type: 'read',
    instructions: {
      query: 'reboot on finish? (y/n):',
      defaultValue: 'y',
      onResponse: ({
        response,
        state,
      }) => {
        const choice = response.toLowerCase()

        if (choice === 'y' || choice === 'ye' || choice === 'yes') {
          state.reboot = true
        } else {
          state.reboot = false
        }
      },
    },
  },

  {
    name: 'get ram size',
    type: 'shell',
    instructions: {
      command: 'sh',
      args: [
        '-c',
        "awk '/MemTotal/ {print $2}' /proc/meminfo",
      ],
      onOutput: [
        {
          perform: ({
            output,
            state,
          }) => state.ramSize = `${Math.round((output / 1024) / 1024)}G`,
        },
      ],
    },
  },

  {
    name: 'set time',
    type: 'shell',
    instructions: {
      command: 'timedatectl',
      args: ['set-ntp', 'true'],
    }
  },

  {
    name: 'locate block devices',
    type: 'shell',
    instructions: {
      command: 'lsblk',
      args: ['--json'],
      onOutput: [
        {
          perform: ({
            output,
            state,
          }) => {
            const json = JSON.parse(output)

            state.devices = json.blockdevices.map(blockdevice => {
              const {
                name,
                size,
              } = blockdevice

              return {
                name: `/dev/${name}`,
                size,
              }
            })
          },
        },
      ],
    },
  },

  {
    name: 'select block devices',
    type: 'read',
    instructions: {
      query: 'enter a number to select an above device to install to:',
      onReady: state => state.devices.forEach((device, index) => {
        console.log()

        const line = `${index + 1}) ${device.name}${(index + 1) === state.devices.length ? '\n' : ''}`

        console.log(line)
      }),
      onResponse: ({
        response,
        state,
      }) => {
        const selection = state.devices[response - 1]

        state.device = selection
        state.partitionBoot = `${state.device.name}2`
        state.partitionRoot = `${state.device.name}3`
      },
    },
  },

  {
    name: 'select root partition size',
    type: 'read',
    instructions: {
      query: state => `enter a size for the root partition (disk size is ${state.device.size}):`,
      defaultValue: '100G',
      onResponse: ({
        response,
        state,
      }) => state.partitionRootSize = response,
    },
  },

  {
    name: 'select tmp partition size',
    type: 'read',
    instructions: {
      query: state => `enter a size for the tmp partition (disk size is ${state.device.size}):`,
      defaultValue: '10G',
      onResponse: ({
        response,
        state,
      }) => state.partitionTmpSize = response,
    },
  },

  {
    name: 'get time zone from IP geolocation',
    type: 'script',
    instructions: {
      script: state => new Promise(resolve => https.get('https://ipapi.co/timezone', response => {
        let data = ''

        response.on('data', chunk => data += chunk)
        response.on('end', () => resolve(state.timeZone = data))
      })),
    },
  },

  {
    name: state => `zeroing device ${state.device.name} (this will take a while)`,
    type: 'shell',
    instructions: {
      command: 'dd',
      args: [
        'if=/dev/zero',
        state => `of=${state.device.name}`,
        'status=progress',
      ],
      onOutput: [
        {
          perform: ({ output }) => console.log(output),
        },
      ],
    },
  },

  {
    name: state => `creating label on device ${state.device.name}`,
    type: 'shell',
    instructions: {
      command: 'parted',
      args: [
        '-a',
        'optimal',
        state => state.device.name,
        'mklabel',
        'msdos',
      ],
    },
  },

  {
    name: state => `creating boot loader partition on device ${state.device.name}`,
    type: 'shell',
    instructions: {
      command: 'parted',
      args: [
        '-a',
        'optimal',
        state => state.device.name,
        'mkpart',
        'primary',
        'ext4',
        '1MiB',
        '5MiB',
      ],
    },
  },

  {
    name: state => `creating boot partition on device ${state.device.name}`,
    type: 'shell',
    instructions: {
      command: 'parted',
      args: [
        '-a',
        'optimal',
        state => state.device.name,
        'mkpart',
        'primary',
        'ext4',
        '5MiB',
        '250MiB',
      ],
    },
  },

  {
    name: state => `creating lvm partition on device ${state.device.name}`,
    type: 'shell',
    instructions: {
      command: 'parted',
      args: [
        '-a',
        'optimal',
        state => state.device.name,
        'mkpart',
        'primary',
        'ext4',
        '250MiB',
        '100%',
      ],
    },
  },

  {
    name: state => `setting boot flag on device ${state.device.name}`,
    type: 'shell',
    instructions: {
      command: 'parted',
      args: [
        '-a',
        'optimal',
        state => state.device.name,
        'set',
        '1',
        'boot',
        'on',
      ],
    },
  },

  {
    name: state => `create physical volume on partition ${state.partitionRoot}`,
    type: 'shell',
    instructions: {
      command: 'pvcreate',
      args: [ state => state.partitionRoot ],
    },
  },

  {
    name: state => `create volume group on partition ${state.partitionRoot}`,
    type: 'shell',
    instructions: {
      command: 'vgcreate',
      args: [
        'main',
        state => state.partitionRoot,
      ],
    },
  },

  {
    name: 'create root logical volume',
    type: 'shell',
    instructions: {
      command: 'lvcreate',
      args: [
        '-L',
        state => state.partitionRootSize,
        '-n',
        'root',
        'main',
      ],
    },
  },

  {
    name: 'create swap logical volume',
    type: 'shell',
    instructions: {
      command: 'lvcreate',
      args: [
        '-L',
        state => state.ramSize,
        '-n',
        'swap',
        'main',
      ],
    },
  },

  {
    name: 'create tmp logical volume',
    type: 'shell',
    instructions: {
      command: 'lvcreate',
      args: [
        '-L',
        state => state.partitionTmpSize,
        '-n',
        'tmp',
        'main',
      ],
    },
  },

  {
    name: 'create home logical volume',
    type: 'shell',
    instructions: {
      command: 'lvcreate',
      args: [
        '-l',
        '100%FREE',
        '-n',
        'home',
        'main',
      ],
    },
  },

  {
    name: 'encrypt root partition',
    type: 'shell',
    instructions: {
      command: 'sh',
      args: [
        '-c',
        state => `echo '${state.partitionRootPassword}' | cryptsetup luksFormat --type luks2 /dev/main/root -q`,
      ],
    },
  },

  {
    name: 'open root partition',
    type: 'shell',
    instructions: {
      command: 'sh',
      args: [
        '-c',
        state => `echo '${state.partitionRootPassword}' | cryptsetup open /dev/main/root root -q`,
      ],
    },
  },

  {
    name: 'create ext4 filesystem on root partition',
    type: 'shell',
    instructions: {
      command: 'mkfs.ext4',
      args: ['/dev/mapper/root'],
    },
  },

  {
    name: 'mount root partition to /mnt',
    type: 'shell',
    instructions: {
      command: 'mount',
      args: [
        '/dev/mapper/root',
        '/mnt',
      ],
    },
  },

  {
    name: 'create /mnt/boot',
    type: 'shell',
    instructions: {
      command: 'mkdir',
      args: ['/mnt/boot'],
    },
  },

  {
    name: 'create /mnt/etc',
    type: 'shell',
    instructions: {
      command: 'mkdir',
      args: ['/mnt/etc'],
    },
  },

  {
    name: 'create /mnt/tmp',
    type: 'shell',
    instructions: {
      command: 'mkdir',
      args: ['/mnt/tmp'],
    },
  },

  {
    name: 'create /mnt/home',
    type: 'shell',
    instructions: {
      command: 'mkdir',
      args: ['/mnt/home'],
    },
  },

  {
    name: 'create LUKS keys directory',
    type: 'shell',
    instructions: {
      command: 'mkdir',
      args: ['/mnt/etc/luks-keys'],
    },
  },

  {
    name: 'change permissions on LUKS keys directory',
    type: 'shell',
    instructions: {
      command: 'chmod',
      args: [
        '600',
        '/mnt/etc/luks-keys',
      ],
    },
  },

  {
    name: 'create boot partition LUKS key',
    type: 'shell',
    instructions: {
      command: 'dd',
      args: [
        'if=/dev/urandom',
        'of=/mnt/etc/luks-keys/boot',
        'bs=1',
        'count=256',
      ],
    },
  },

  {
    name: 'change permissions on boot partition LUKS key',
    type: 'shell',
    instructions: {
      command: 'chmod',
      args: [
        '600',
        '/mnt/etc/luks-keys/boot',
      ],
    },
  },

  {
    name: 'encrypt boot partition',
    type: 'shell',
    instructions: {
      command: 'sh',
      args: [
        '-c',
        state => `echo '${state.partitionBootPassword}' | cryptsetup luksFormat /dev/sda2 -q`,
      ],
    },
  },

  {
    name: 'add boot partition LUKS key',
    type: 'shell',
    instructions: {
      command: 'sh',
      args: [
        '-c',
        state => `echo '${state.partitionBootPassword}' | cryptsetup luksAddKey /dev/sda2 /mnt/etc/luks-keys/boot -q`,
      ],
    },
  },

  {
    name: 'open boot partition',
    type: 'shell',
    instructions: {
      command: 'cryptsetup',
      args: [
        'open',
        '/dev/sda2',
        'boot',
        '--key-file',
        '/mnt/etc/luks-keys/boot',
        '-q',
      ],
    },
  },

  {
    name: 'create home partition LUKS key',
    type: 'shell',
    instructions: {
      command: 'dd',
      args: [
        'if=/dev/urandom',
        'of=/mnt/etc/luks-keys/home',
        'bs=1',
        'count=256',
      ],
    },
  },

  {
    name: 'change permissions on home partition LUKS key',
    type: 'shell',
    instructions: {
      command: 'chmod',
      args: [
        '600',
        '/mnt/etc/luks-keys/home',
      ],
    },
  },

  {
    name: 'encrypt home partition',
    type: 'shell',
    instructions: {
      command: 'cryptsetup',
      args: [
        'luksFormat',
        '--type',
        'luks2',
        '-v',
        '/dev/main/home',
        '/mnt/etc/luks-keys/home',
        '-q',
      ],
    },
  },

  {
    name: 'open home partition',
    type: 'shell',
    instructions: {
      command: 'cryptsetup',
      args: [
        '-d',
        '/mnt/etc/luks-keys/home',
        'open',
        '/dev/main/home',
        'home',
        '-q',
      ],
    },
  },

  {
    name: 'create ext4 filesystem on boot partition',
    type: 'shell',
    instructions: {
      command: 'mkfs.ext4',
      args: ['/dev/mapper/boot'],
    },
  },

  {
    name: 'create ext4 filesystem on home partition',
    type: 'shell',
    instructions: {
      command: 'mkfs.ext4',
      args: ['/dev/mapper/home'],
    },
  },

  {
    name: 'create ext4 filesystem on first partition',
    type: 'shell',
    instructions: {
      command: 'mkfs.ext4',
      args: ['/dev/sda1'],
    },
  },

  {
    name: 'mount home partition to /mnt/home',
    type: 'shell',
    instructions: {
      command: 'mount',
      args: [
        '-t',
        'ext4',
        '/dev/mapper/home',
        '/mnt/home',
      ],
    },
  },

  {
    name: 'mount boot partition to /mnt/boot',
    type: 'shell',
    instructions: {
      command: 'mount',
      args: [
        '-t',
        'ext4',
        '/dev/mapper/boot',
        '/mnt/boot',
      ],
    },
  },

  {
    name: 'install reflector',
    type: 'shell',
    instructions: {
      command: 'pacman',
      args: [
        '-Sy',
        '--noconfirm',
        'reflector',
      ]
    }
  },

  {
    name: 'run reflector',
    type: 'shell',
    instructions: {
      command: 'reflector',
      args: [
        '--latest',
        '200',
        '--protocol',
        'https',
        '--sort',
        'rate',
        '--age',
        '24',
        '--save',
        '/etc/pacman.d/mirrorlist',
      ]
    },
  },

  {
    name: 'install arch linux to /mnt',
    type: 'shell',
    instructions: {
      command: 'pacstrap',
      args: [
        '/mnt',
        'base',
        'base-devel',
        'git',
        'grub',
        'ntp',
        'nodejs',
        'npm',
        'reflector',
        'vim',
        'zsh',
        'terminus-font',
      ],
      onOutput: [
        {
          perform: ({ output }) => console.log(output),
        },
      ],
    },
  },

  {
    name: 'set /etc/crypttab',
    type: 'script',
    instructions: {
      script: () => {
        const content =
`boot\t/dev/sda2\t/etc/luks-keys/boot
home\t/dev/main/home\t/etc/luks-keys/home
tmp\t/dev/main/tmp\t/dev/urandom\t\ttmp,cipher=aes-xts-plain64,size=256
swap\t/dev/main/swap\t/dev/urandom\t\tswap,cipher=aes-xts-plain64,size=256`

        fs.writeFileSync('/mnt/etc/crypttab', content, 'utf-8')
      },
    },
  },

  {
    name: 'set /etc/fstab',
    type: 'script',
    instructions: {
      script: () => {
        const content =
`/dev/mapper/root\t/\text4\tdefaults\t0 1
/dev/mapper/boot\t/boot\text4\tdefaults\t0 2
/dev/mapper/home\t/home\text4\tdefaults\t0 2
/dev/mapper/tmp\t\t/tmp\ttmpfs\tdefaults\t0 0
/dev/mapper/swap\tnone\tswap\tsw\t\t0 0`

        fs.writeFileSync('/mnt/etc/fstab', content, 'utf-8')
      },
    },
  },

  {
    name: 'install tj/n',
    type: 'shell',
    instructions: {
      command: 'chroot',
      args: [
        '/mnt',
        'npm',
        'install',
        '--global',
        'n',
      ],
    },
  },

  {
    name: 'install latest node in root',
    type: 'shell',
    instructions: {
      command: 'chroot',
      args: [
        '/mnt',
        'n',
        'latest',
      ],
    },
  },

  {
    name: 'copy secrets to install directory',
    type: 'script',
    instructions: {
      script: state => {
        const json = JSON.stringify(state)

        fs.writeFileSync('./secrets.json', json, 'utf-8')
      },
    },
  },

  {
    name: 'copy install directory to /mnt/root',
    type: 'shell',
    instructions: {
      command: 'cp',
      args: [
        '-r',
        '.',
        '/mnt/root/install',
      ],
    },
  },

  {
    name: 'start chroot.js',
    type: 'shell',
    instructions: {
      command: 'arch-chroot',
      args: [
        '/mnt',
        'node',
        '/root/install/examples/arch-linux-install/chroot.js',
      ],
      onOutput: [
        {
          perform: ({ output }) => console.log(output),
        },
      ],
    },
  },

  {
    name: 'reboot',
    type: 'shell',
    conditional: state => state.reboot === true,
    instructions: { command: 'reboot' },
  },
]

run(steps)
