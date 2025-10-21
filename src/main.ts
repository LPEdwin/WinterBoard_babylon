import {
    Engine,
    Scene,
    ArcRotateCamera,
    HemisphericLight,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Vector3,
    PointerEventTypes,
    AbstractMesh,
    RectAreaLight,
    AxesViewer,
    Color4,
    GlowLayer,
    ImportMeshAsync,
    LoadAssetContainerAsync,
    Mesh,
    Texture,
    DirectionalLight,
    ShadowGenerator,
    CubeTexture,
} from "@babylonjs/core";
import "@babylonjs/loaders";
import { isMobile } from "./device";

async function initScene() {

    const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
    const engine = new Engine(canvas, true);
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0, 0, 0, 1);
    const localAxes = new AxesViewer(scene, 1);
    const camera = createCamera(scene);
    const [keyLight, ambientLight] = createSceneLight(scene);

    const hdri = `${import.meta.env.BASE_URL}hdri/hdr_rich_multi_nebulae_1.env`;
    const hdrTexture = CubeTexture.CreateFromPrefilteredData(hdri, scene);
    const skybox = scene.createDefaultSkybox(hdrTexture, true, 100)!;

    // Board setup
    const boardSize = 8;
    const tileSize = 1;
    const tiles: AbstractMesh[] = [];
    const gl = new GlowLayer("glow", scene);
    const even_diff = new Color3(0.08235294118, 0.50980392157, 0.69019607843);
    const odd_diff = new Color3(0.28627450980, 0.85098039216, 0.88235294118);
    const selectedColor = new Color3(0.2, 0.6, 1);

    let url = `${import.meta.env.BASE_URL}models/box.glb`;
    const boxAsset = await LoadAssetContainerAsync(url, scene);
    const newBox = () => {
        const instance = boxAsset.instantiateModelsToScene();
        const root = instance.rootNodes[0] as AbstractMesh;
        const mesh = root.getChildMeshes()[0] as Mesh;
        mesh.parent = null;
        return mesh;
    };

    for (let x = 0; x < boardSize; x++) {
        for (let z = 0; z < boardSize; z++) {
            const tile = newBox();
            //const tile = MeshBuilder.CreateBox("",{height:1,width:1,},scene);
            tile.name = `tile_${x}_${z}`;
            tile.scaling = tile.scaling.scale(0.98);
            tile.receiveShadows = true;
            tile.position.set(
                (x - boardSize / 2 + 0.5) * tileSize,
                0,
                (z - boardSize / 2 + 0.5) * tileSize
            );
            const mat = new StandardMaterial(`mat_${x}_${z}`, scene);
            tile.material = mat;
            if ((x + z) % 2 == 0) {
                mat.diffuseColor = even_diff;
            }
            else {
                mat.diffuseColor = odd_diff;
            }

            gl.addIncludedOnlyMesh(tile);
            tiles.push(tile);
        }
    }

    const scar = await loadScar(scene);
    scar.position.set(-0.1, 1, tileSize * .5);
    let currentTarget: Vector3 | null = null;
    const MOVE_SPEED = 5;

    createShadows(keyLight, [scar]);

    // Highlighting logic
    let highlighted: AbstractMesh | null = null;
    scene.onPointerObservable.add((pointerInfo) => {
        if (pointerInfo.type === PointerEventTypes.POINTERPICK) {
            const pick = pointerInfo.pickInfo;
            if (pick?.pickedMesh && tiles.includes(pick.pickedMesh)) {
                currentTarget = pick.pickedMesh.getAbsolutePosition().clone();
                currentTarget.x += -0.4;
                currentTarget.y = scar.position.y;

                // Unhighlight old
                if (highlighted && highlighted.material) {
                    (highlighted.material as StandardMaterial).emissiveColor = Color3.Black();
                }
                highlighted = pick.pickedMesh;
                (highlighted.material as StandardMaterial).emissiveColor = selectedColor
            }
        }
    });

    const updateFunction = () => {
        const deltaTime = scene.getEngine().getDeltaTime() / 1000;

        if (currentTarget) {
            const amount = MOVE_SPEED * deltaTime;

            if (Vector3.Distance(scar.position, currentTarget) < 0.001) {
                scar.setAbsolutePosition(currentTarget.clone())
                currentTarget = null;
            } else {
                scar.setAbsolutePosition(
                    Vector3.Lerp(
                        scar.getAbsolutePosition(),
                        currentTarget,
                        amount
                    ));
            }
        }
    };

    scene.onBeforeRenderObservable.add(updateFunction);

    // Run loop
    const fpsDiv = ensureFpsDiv();
    engine.runRenderLoop(() => {
        scene.render();
        fpsDiv.textContent = `${engine.getFps().toFixed(0)} fps`;
    }
    );
    window.addEventListener("resize", () => engine.resize());

    function createCamera(scene: Scene) {
        const camera = new ArcRotateCamera("camera", Math.PI / 4, Math.PI / 3, 12, Vector3.Zero(), scene);
        camera.attachControl(canvas, true);
        camera.lowerRadiusLimit = 5;
        camera.upperRadiusLimit = 25;
        camera.wheelPrecision = 30;
        return camera;
    }

    function createSceneLight(scene: Scene): [DirectionalLight, HemisphericLight] {
        let light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
        light.intensity = 0.4;

        const dir = new Vector3(0, -1, -1);
        let dirLight = new DirectionalLight('dir_light', dir, scene);
        dirLight.position = dir.multiply(new Vector3(-1, -1, -1).scale(10));
        dirLight.intensity = 0.7;

        return [dirLight, light]
    }

    function createRectangleLight(
        position: Vector3,
        width: number,
        height: number,
        rotation: Vector3,
        color: Color3,
        scene: Scene,
        name?: string
    ) {
        const box = MeshBuilder.CreateBox(`${name}_light_mesh`, { width, height, depth: 0.01 });
        const lightMaterial = new StandardMaterial(`${name}_light_mat`);
        lightMaterial.disableLighting = true;
        lightMaterial.emissiveColor = color;
        box.material = lightMaterial;
        box.visibility = 0;

        // const localAxes = new AxesViewer(scene, 1);
        // localAxes.xAxis.parent = box;
        // localAxes.yAxis.parent = box;
        // localAxes.zAxis.parent = box;

        box.position = position
        box.rotation = rotation;

        var light = new RectAreaLight(`${name}_light`, new Vector3(0, 0, 0), width, height, scene);
        light.parent = box;
        light.specular = color;
        light.diffuse = color;
    }

    async function loadModel(
        url: string,
        scene: Scene
    ): Promise<Mesh> {
        const result = await ImportMeshAsync(url, scene);
        return result.meshes[0].getChildMeshes()[0] as Mesh;
    }

    async function loadScar(scene: Scene): Promise<Mesh> {
        let url = `${import.meta.env.BASE_URL}models/card_holder.glb`;
        const model = await loadModel(url, scene);
        const mat = new StandardMaterial(`mat_scar`, scene);
        mat.diffuseColor = new Color3(0.86666666667, 0.51764705882, 0.21568627451);
        model.material = mat;
        const card = MeshBuilder.CreatePlane('scar_card',
            {
                width: 1,
                height: 1,
                sideOrientation: Mesh.DOUBLESIDE
            }, scene);
        card.position.set(0.1, 0.6, 0);
        const card_mat = new StandardMaterial('scar_card_mat', scene);
        card_mat.diffuseTexture = new Texture(`${import.meta.env.BASE_URL}models/Scar_Lion_King.png`, scene);
        card_mat.diffuseTexture.hasAlpha = true;
        card_mat.useAlphaFromDiffuseTexture = true;
        card.material = card_mat;
        model.addChild(card)
        return model
    }

    function createShadows(light: DirectionalLight, meshes: Mesh[]) {
        const shadowGenerator = new ShadowGenerator(1024, light);
        shadowGenerator.bias = 0.00001;
        //shadowGenerator.normalBias = 0.02;
        for (let m of meshes)
            shadowGenerator.addShadowCaster(m, true)
    }

    function ensureFpsDiv() {
        let el = document.getElementById("fps") as HTMLDivElement | null;
        if (!el) {
            el = document.createElement("div");
            el.id = "fps";
            Object.assign(el.style, {
                position: "fixed",
                top: "8px",
                left: "8px",
                padding: "4px 8px",
                fontFamily: "monospace",
                fontSize: isMobile() ? "3rem" : "14px",
                background: "rgba(0,0,0,0.5)",
                color: "#fff",
                borderRadius: "6px",
                zIndex: "9999",
                userSelect: "none",
            });
            document.body.appendChild(el);
        }
        return el;
    }
}

initScene().catch(error => {
    console.error("Failed to initialize scene:", error);
});