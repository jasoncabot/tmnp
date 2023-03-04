import { Input } from 'phaser';
import { getGameWidth, getGameHeight } from '../helpers';

const sceneConfig: Phaser.Types.Scenes.SettingsConfig = {
  active: false,
  visible: false,
  key: 'Game',
};

export class GameScene extends Phaser.Scene {
  public speed = 200;

  private cursorKeys: Phaser.Types.Input.Keyboard.CursorKeys;
  private parrot: Phaser.Physics.Arcade.Sprite;
  private helicopters: Phaser.GameObjects.Group;
  private shotEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private shh: Phaser.Sound.BaseSound;
  private level: number;

  constructor() {
    super(sceneConfig);
  }

  public create(data: any): void {
    this.level = data.level || 1;

    this.anims.create({
      key: 'flapup',
      frames: this.anims.generateFrameNumbers('birds', { start: 51, end: 53, first: 0 }),
      frameRate: 8,
      repeat: -1
    });

    let background = this.add.image(this.cameras.main.width / 2, this.cameras.main.height / 2, 'background')
    let scaleX = this.cameras.main.width / background.width
    let scaleY = this.cameras.main.height / background.height
    background.setScale(Math.max(scaleX, scaleY)).setScrollFactor(0)

    this.parrot = this.physics.add.sprite(getGameWidth(this) / 2, getGameHeight(this) / 2, 'birds').setFrame(51);
    this.parrot.setCollideWorldBounds(true, 1, 1);
    this.parrot.setGravity(0, 50);

    this.helicopters = this.add.group();
    for (let i = 0; i <= (8 + (this.level * Phaser.Math.Between(0, 3))); i++) {
      const sprite = ['helicopter', 'spitfire'][Phaser.Math.Between(0, 1)];
      const helicopter = this.physics.add.sprite(Phaser.Math.Between(0, getGameWidth(this)), Phaser.Math.Between(0, getGameHeight(this)), sprite);
      helicopter.setCollideWorldBounds(true, 1, 1);
      helicopter.setVelocity(Phaser.Math.Between(0, (100 * this.level)), Phaser.Math.Between(0, (100 * this.level)));
      this.helicopters.add(helicopter);
    }

    const tanks = [
      this.physics.add.sprite(Phaser.Math.Between(0, getGameWidth(this)), getGameHeight(this), 'tank').setOrigin(0.5, 1),
      this.physics.add.sprite(Phaser.Math.Between(0, getGameWidth(this)), getGameHeight(this), 'tank').setOrigin(0.5, 1)
    ];
    tanks.forEach(x => {
      x.setCollideWorldBounds(true, 1, 1);
      x.setVelocity((100 * this.level), 0);
    });

    const levelText = this.add.text(getGameWidth(this) / 2, getGameHeight(this) / 2, `Level ${this.level}`)
      .setOrigin(0.5, 0.5)
      .setColor("#e26700")
      .setFontSize(56);
    this.tweens.add({
      targets: levelText,
      alpha: 0,
      duration: 3000,
      ease: 'cubic.out'
    });



    this.physics.add.collider(this.parrot, this.helicopters);
    this.physics.add.collider(this.helicopters, this.helicopters);

    this.shh = this.sound.add('shh', { loop: true, volume: 0.1 });

    const toTest = this.helicopters.children.entries.concat(tanks);

    const checkForLevelComplete = () => {
      for (let i = 0; i < toTest.length; i++) {
        if (toTest[i].active) return;
      }

      this.scene.restart({ level: this.level + 1 });
    }

    const hitByIceBlast = (x, y) => {
      return (obj: any) => {
        if (obj && obj.body && obj.body.hitTest(x, y)) {
          this.sound.play('boom');
          obj.destroy();
          checkForLevelComplete();
          return true;
        }
        return false;
      }
    }


    const shotManager = this.add.particles('ice-blast');
    shotManager.setDepth(1);
    this.shotEmitter = shotManager.createEmitter({
      x: this.parrot.getCenter().x,
      y: this.parrot.getCenter().y,
      lifespan: 750,
      speed: { min: 200, max: 400 },
      on: false,
      scale: { start: 0.4, end: 0 },
      quantity: 1,
      blendMode: 'ADD',
      deathZone: {
        type: 'onEnter',
        source: {
          contains: (x: number, y: number) => {
            const hits = toTest.map(hitByIceBlast(x, y));

            for (let i = 0; i < hits.length; i++) {
              if (hits[i]) return true;
            }

            return false;
          }
        }
      }
    });

    // This is a nice helper Phaser provides to create listeners for some of the most common keys.
    this.cursorKeys = this.input.keyboard.createCursorKeys();
    this.input.keyboard.on('keydown-SPACE', () => {
      this.shotEmitter.start();
      this.shh.play();
    }, this);
    this.input.keyboard.on('keyup-SPACE', () => {
      this.shotEmitter.stop();
      this.shh.stop();
    }, this);
    this.input.keyboard.on('keydown-UP', () => {
      this.parrot.play('flapup');
    }, this);
    this.input.keyboard.on('keyup-UP', () => {
      this.parrot.stopAfterRepeat(0);
    }, this);
  }

  public update(time: number, delta: number): void {

    if (this.cursorKeys.left.isDown) {
      this.parrot.setAngularVelocity(-300);
    } else if (this.cursorKeys.right.isDown) {
      this.parrot.setAngularVelocity(300);
    } else {
      this.parrot.setAngularVelocity(0);
    }

    if (this.cursorKeys.up.isDown) {
      this.physics.velocityFromRotation(this.parrot.rotation - (Math.PI / 2), 400, (this.parrot.body as Phaser.Physics.Arcade.Body).acceleration);
    } else {
      this.parrot.setAcceleration(0);
    }

    this.shotEmitter.setPosition(this.parrot.x, this.parrot.y);
    this.shotEmitter.setAngle(this.parrot.angle - 90);
    this.shotEmitter.setEmitterAngle({ min: this.parrot.angle - 93, max: this.parrot.angle - 87 });

    // Don't allow us to fly over the speed limit!
    const speedLimit = 100;
    if (this.parrot.body.velocity.lengthSq() > speedLimit * speedLimit) {
      this.parrot.body.velocity.setLength(speedLimit);
    }

  }

}
