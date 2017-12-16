import Physics from "./physics/Physics.js";
import Car from "./physics/Car.js";
import Path from "./autonomy/Path.js";
import CubicPathOptimizer from "./autonomy/path_finding/CubicPathOptimizer.js";
import AutonomousController from "./autonomy/control/AutonomousController.js";
import ManualController from "./autonomy/control/ManualController.js";
import MapObject from "./objects/MapObject.js";
import CarObject from "./objects/CarObject.js";
import Editor from "./simulator/Editor.js";
import TopDownCameraControls from "./simulator/TopDownCameraControls.js";
import Dashboard from "./simulator/Dashboard.js";

const savedPoints = [[-631.6930144348489,-33.67084242671334],[-593.9903716035712,-30.01039166639495],[-568.8247726263819,-27.814121210204082],[-540.090234157882,-25.16029440897316],[-514.0095224906171,-22.597978876750254],[-490.21659254854706,-20.401708420559153],[-461.2075202730249,-18.02241542635234],[-431.0088015003984,-15.27707735611351],[-415.4518857690462,-13.72138578297814],[-374.45483725347833,-9.877912484643838],[-348.0080805101781,-7.681642028452778],[-324.6727069131497,-5.576882841269789],[-301.88640093016795,-3.7466574611105914],[-280.5642752513121,-2.099454618967302],[-257.22890165428305,0.3713496442476072],[-231.7887688700697,2.7506426384545577],[-206.25712481684943,4.855401825637642],[-184.20290898593072,6.594115936788864],[-164.61949741822764,7.600739895876428],[-148.87955914885873,7.692251164884394],[-130.668816616275,7.051672281828685],[-114.37981073285812,6.228070860757045],[-97.816271042417,4.580868018613763],[-77.86681439868158,2.567620100438636],[-56.54468871982702,-0.36074050781607614],[-37.51034476617124,-2.740033502023039],[-20.123203654659157,-5.027815227222064],[1.9310121762591272,-6.5835068003573936],[31.855197141862007,-9.420356139604014],[57.478352464090754,-11.52511532678712],[81.91186128921566,-13.629874513970247],[106.80292645938118,-17.74788161932838],[119.33997031347181,-20.676242227583085],[147.34241862990802,-29.00376770730759],[165.0040935484445,-35.86711288290456],[182.0213328603885,-44.68906886380947],[193.71989952976497,-52.36994596996584],[206.36380491989868,-60.99616179687965],[220.18938371097997,-71.27672038511945],[244.01063607808462,-89.26100493931415],[257.9203489672942,-99.60177833721384],[273.9348210436872,-111.68126584626495],[288.8511578919844,-122.84564066523595],[302.9438933192096,-133.46094787015875],[317.4941850914762,-144.3507888821061],[338.3587544252924,-159.9077046134596],[351.9939335074796,-170.33998928036596],[371.21129999914933,-184.61574724560788],[392.07586933296307,-200.26417424596977],[407.99883014034856,-212.25215048601177],[422.36609937459855,-222.86745769093483],[437.5569700299214,-234.21485504792182],[452.93086322325786,-246.0198087499508],[466.47453103643613,-256.0860483408265],[484.9598073760437,-269.9042499610264],[499.235565341286,-280.70257970396545],[519.0019994470048,-295.61891655226304],[533.2777574122471,-306.4172462952034],[548.5601393365735,-317.7646436521925],[565.7642579100728,-330.9422663893375],[581.5041961794415,-342.4726862843406],[597.9762246008769,-354.7351963314076]];

let follow = false;

export default class Simulator {
  constructor(geolocation, domElement) {
    this.geolocation = geolocation;

    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(domElement.clientWidth, domElement.clientHeight);
    this.renderer.shadowMap.enabled = true;
    domElement.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(45, domElement.clientWidth / domElement.clientHeight, 1, 10000);
    this.camera.position.set(0, 20, 20);
    this.camera.lookAt(new THREE.Vector3(0, 0, 0));

    this.topDownControls = new TopDownCameraControls(this.renderer.domElement, this.camera);

    this.orbitControls = new THREE.OrbitControls(this.camera);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x111111);

    this.editor = new Editor(this.renderer.domElement, this.camera, this.scene);

    const map = new MapObject(this.geolocation);
    this.scene.add(map);

    this.physics = new Physics();
    this.car = this.physics.createCar();

    const carObject = new CarObject(this.car);
    this.scene.add(carObject);

    this.carController = new ManualController();

    this.dashboard = new Dashboard(this.car);

    this.prevTimestamp = null;
    this.simulatedTime = 0;

    window.addEventListener('resize', () => {
      this.camera.aspect = domElement.clientWidth / domElement.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(domElement.clientWidth, domElement.clientHeight);
    });

    requestAnimationFrame(render.bind(this));
    let count = 0;
    let failed = 0;
    const startDate = +new Date;

    for (let x = 1; x <= 50; x += 49/15) {
      for (let y = -50; y <= 50; y += 100/15) {
        for (let r = -Math.PI / 2; r <= Math.PI / 2; r += Math.PI/15) {
          for (let k0 = -0.19; k0 <= 0.19; k0 += 0.38 / 15) {
            for (let k1 = -0.19; k1 <= 0.19; k1 += 0.38 / 15) {
              const start = { x: 0, y: 0, rot: 0, curv: k0 };
              const end = { x: x, y: y, rot: r, curv: k1 };
              const optimizer = new CubicPathOptimizer(start, end);
              const converged = optimizer.optimize();
              const cubicPath = optimizer.buildPath(100);

              /*
              const pathGeometry = new THREE.Geometry();
              pathGeometry.setFromPoints(cubicPath.map(p => new THREE.Vector3(p.pos.x, 0, p.pos.y)));
              const pathLine = new MeshLine();
              pathLine.setGeometry(pathGeometry);

              const pathObject = new THREE.Mesh(pathLine.geometry, new MeshLineMaterial({ color: converged ? new THREE.Color(0x40aaff) : new THREE.Color(0xffaa40), lineWidth: 0.1, depthTest: false, transparent: true, opacity: 0.7, resolution: new THREE.Vector2(this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight) }));
              pathObject.renderOrder = 1;
              this.scene.add(pathObject);
              */
              count++;
              if (!converged) failed++;
              if (count % 10000 == 0) {
                console.log(`Count: ${count} (${failed} failed)`);
              }
            }
          }
        }
      }
    }
    console.log(`Final count: ${count} (${failed} failed) in ${((+new Date) - startDate) / 1000} seconds`);
  }

  enableEditor() {
    this.editor.enabled = true;
    this.orbitControls.enabled = false;
    this.topDownControls.enable();
  }

  go() {
    const curve = new THREE.SplineCurve(this.editor.points.map(p => new THREE.Vector2(p.position.x, p.position.z)));
    const points = curve.getPoints(100 * this.editor.points.length);

    const startRot = points[1].clone().sub(points[0]).angle();
    const goalRot = points[points.length - 1].clone().sub(points[points.length - 2]).angle();

    const poses = points.map((p) => { return { pos: p, dir: 1 } });
    const path = new Path(poses, startRot, goalRot);

    autoController = new AutonomousController(path);
    this.car.setPose(points[0].x, points[0].y, startRot);

    const frontMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, depthTest: false });
    const frontGeometry = new THREE.Geometry();
    frontGeometry.vertices.push(...path.poses.map(p => new THREE.Vector3(p.frontPos.x, 0, p.frontPos.y)));
    this.scene.add(new THREE.Line(frontGeometry, frontMaterial));

    this.editor.enabled = false;
    follow = true;
  }

  go2() {
    savedPoints.forEach(p => this.editor.addPoint(new THREE.Vector2(p[0], p[1])));
    const curve = new THREE.SplineCurve(this.editor.points.map(p => new THREE.Vector2(p.position.x, p.position.z)));
    const points = curve.getPoints(100 * savedPoints.length);

    const startRot = points[1].clone().sub(points[0]).angle();
    const goalRot = points[points.length - 1].clone().sub(points[points.length - 2]).angle();

    const poses = points.map((p) => { return { pos: p, dir: 1 } });
    const path = new Path(poses, startRot, goalRot);

    autoController = new AutonomousController(path);
    this.car.setPose(points[0].x, points[0].y, startRot);

    const frontMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, depthTest: false });
    const frontGeometry = new THREE.Geometry();
    frontGeometry.vertices.push(...path.poses.map(p => new THREE.Vector3(p.frontPos.x, 0, p.frontPos.y)));
    this.scene.add(new THREE.Line(frontGeometry, frontMaterial));

    this.editor.enabled = false;
    follow = true;
  }
}

let autoController = null;

function render(timestamp) {
  requestAnimationFrame(render.bind(this));

  if (this.prevTimestamp == null) {
    this.prevTimestamp = timestamp;
    return;
  }

  const dt = Math.min((timestamp - this.prevTimestamp) / 1000, 1 / 30);
  this.simulatedTime += dt;
  this.prevTimestamp = timestamp;

  const controls = this.carController.control(this.car.pose, this.car.wheelAngle, this.car.speed, dt);
  if (autoController) {
    const autoControls = autoController.control(this.car.pose, this.car.wheelAngle, this.car.speed, dt);
    controls.steer = autoControls.steer;
  }
  this.car.update(controls, dt);
  this.physics.step(dt);
  //console.log(car.speed * 2.23694);

  const carPosition = this.car.position;
  const carRotation = this.car.rotation;
  if (follow) {
    this.camera.position.set(carPosition[0] - 0.20 * Math.cos(carRotation), 30, carPosition[1] - 0.20 * Math.sin(carRotation));
    this.camera.lookAt(carPosition[0], 0, carPosition[1]);
  }

  this.dashboard.update(controls);

  this.renderer.render(this.scene, this.camera);
}