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
  shh: Phaser.Sound.BaseSound;

  constructor() {
    super(sceneConfig);
  }

  public create(): void {
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
    for (let i = 0; i <= 9; i++) {
      const helicopter = this.physics.add.sprite(Phaser.Math.Between(0, getGameWidth(this)), Phaser.Math.Between(0, getGameHeight(this)), 'helicopter');
      helicopter.setCollideWorldBounds(true, 1, 1);
      helicopter.setVelocity(Phaser.Math.Between(0, 100), Phaser.Math.Between(0, 100));
      this.helicopters.add(helicopter);
    }

    const tank = this.physics.add.sprite(0, getGameHeight(this), 'tank').setOrigin(0.5, 1);
    tank.setCollideWorldBounds(true, 1, 1);
    tank.setVelocity(100, 0);

    this.physics.add.collider(this.parrot, this.helicopters);
    this.physics.add.collider(this.helicopters, this.helicopters);

    this.shh = this.sound.add('shh', { loop: true, volume: 0.1 });

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
            let hit = false;
            this.helicopters.children.entries.forEach((obj: any) => {
              if (obj.body.hitTest(x, y)) {
                this.sound.play('boom');
                hit = true;
                obj.destroy();
              }
            })

            return hit;
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
