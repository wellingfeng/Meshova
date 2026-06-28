// Minimal planar Reflector for Meshova — independently written from the standard
// planar-reflection technique (mirror the camera across the reflector plane,
// render the scene into an offscreen target, sample it with a projective UV).
// MIT-spirit clean reimplementation; no GPL source involved.
import {
  Color, Matrix4, Mesh, PerspectiveCamera, Plane, ShaderMaterial,
  UniformsUtils, Vector3, Vector4, WebGLRenderTarget, HalfFloatType,
} from "three";

class Reflector extends Mesh {
  constructor(geometry, options = {}) {
    super(geometry);
    this.isReflector = true;
    this.type = "Reflector";
    this.camera = new PerspectiveCamera();

    const color = options.color !== undefined ? new Color(options.color) : new Color(0x7f7f7f);
    const textureWidth = options.textureWidth || 1024;
    const textureHeight = options.textureHeight || 1024;
    const clipBias = options.clipBias || 0;
    const multisample = options.multisample !== undefined ? options.multisample : 4;

    const reflectorPlane = new Plane();
    const normal = new Vector3();
    const reflectorWorldPosition = new Vector3();
    const cameraWorldPosition = new Vector3();
    const rotationMatrix = new Matrix4();
    const lookAtPosition = new Vector3(0, 0, -1);
    const clipPlane = new Vector4();
    const view = new Vector3();
    const target = new Vector3();
    const q = new Vector4();
    const textureMatrix = new Matrix4();
    const virtualCamera = this.camera;

    const renderTarget = new WebGLRenderTarget(textureWidth, textureHeight, { samples: multisample, type: HalfFloatType });

    const material = new ShaderMaterial({
      name: "ReflectorShader",
      uniforms: UniformsUtils.clone(Reflector.ReflectorShader.uniforms),
      fragmentShader: Reflector.ReflectorShader.fragmentShader,
      vertexShader: Reflector.ReflectorShader.vertexShader,
      transparent: true,
    });
    material.uniforms["tDiffuse"].value = renderTarget.texture;
    material.uniforms["color"].value = color;
    material.uniforms["textureMatrix"].value = textureMatrix;
    material.uniforms["opacity"].value = options.opacity !== undefined ? options.opacity : 1.0;
    this.material = material;

    this.onBeforeRender = function (renderer, scene, camera) {
      reflectorWorldPosition.setFromMatrixPosition(this.matrixWorld);
      cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
      rotationMatrix.extractRotation(this.matrixWorld);
      normal.set(0, 0, 1).applyMatrix4(rotationMatrix);

      view.subVectors(reflectorWorldPosition, cameraWorldPosition);
      if (view.dot(normal) > 0) return; // behind the mirror — skip

      view.reflect(normal).negate();
      view.add(reflectorWorldPosition);

      rotationMatrix.extractRotation(camera.matrixWorld);
      lookAtPosition.set(0, 0, -1).applyMatrix4(rotationMatrix).add(cameraWorldPosition);
      target.subVectors(reflectorWorldPosition, lookAtPosition);
      target.reflect(normal).negate();
      target.add(reflectorWorldPosition);

      virtualCamera.position.copy(view);
      virtualCamera.up.set(0, 1, 0).applyMatrix4(rotationMatrix).reflect(normal);
      virtualCamera.lookAt(target);
      virtualCamera.far = camera.far;
      virtualCamera.updateMatrixWorld();
      virtualCamera.projectionMatrix.copy(camera.projectionMatrix);

      // projective texture matrix (maps clip space -> [0,1] UV)
      textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
      textureMatrix.multiply(virtualCamera.projectionMatrix);
      textureMatrix.multiply(virtualCamera.matrixWorldInverse);
      textureMatrix.multiply(this.matrixWorld);

      // oblique near-plane clipping so geometry behind the mirror is culled
      reflectorPlane.setFromNormalAndCoplanarPoint(normal, reflectorWorldPosition);
      reflectorPlane.applyMatrix4(virtualCamera.matrixWorldInverse);
      clipPlane.set(reflectorPlane.normal.x, reflectorPlane.normal.y, reflectorPlane.normal.z, reflectorPlane.constant);
      const projectionMatrix = virtualCamera.projectionMatrix;
      q.x = (Math.sign(clipPlane.x) + projectionMatrix.elements[8]) / projectionMatrix.elements[0];
      q.y = (Math.sign(clipPlane.y) + projectionMatrix.elements[9]) / projectionMatrix.elements[5];
      q.z = -1.0;
      q.w = (1.0 + projectionMatrix.elements[10]) / projectionMatrix.elements[14];
      clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));
      projectionMatrix.elements[2] = clipPlane.x;
      projectionMatrix.elements[6] = clipPlane.y;
      projectionMatrix.elements[10] = clipPlane.z + 1.0 - clipBias;
      projectionMatrix.elements[14] = clipPlane.w;

      this.visible = false;
      const currentRenderTarget = renderer.getRenderTarget();
      const currentXrEnabled = renderer.xr.enabled;
      const currentShadowAutoUpdate = renderer.shadowMap.autoUpdate;
      renderer.xr.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(renderTarget);
      if (renderer.autoClear === false) renderer.clear();
      renderer.render(scene, virtualCamera);
      renderer.xr.enabled = currentXrEnabled;
      renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;
      renderer.setRenderTarget(currentRenderTarget);
      this.visible = true;
    };

    this.getRenderTarget = () => renderTarget;
    this.dispose = () => { renderTarget.dispose(); this.material.dispose(); };
  }
}

Reflector.ReflectorShader = {
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    opacity: { value: 1.0 },
  },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main() {
      vUv = textureMatrix * vec4( position, 1.0 );
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float opacity;
    varying vec4 vUv;
    #include <logdepthbuf_pars_fragment>
    float blendOverlay( float base, float blend ) {
      return ( base < 0.5 ? ( 2.0 * base * blend ) : ( 1.0 - 2.0 * ( 1.0 - base ) * ( 1.0 - blend ) ) );
    }
    vec3 blendOverlay( vec3 base, vec3 blend ) {
      return vec3( blendOverlay( base.r, blend.r ), blendOverlay( base.g, blend.g ), blendOverlay( base.b, blend.b ) );
    }
    void main() {
      #include <logdepthbuf_fragment>
      vec4 base = texture2DProj( tDiffuse, vUv );
      gl_FragColor = vec4( blendOverlay( base.rgb, color ), opacity );
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export { Reflector };
