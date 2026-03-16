import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

// Types
interface BuildingPoint {
  x: number;
  y: number;
}

interface Building {
  id: number;
  points: BuildingPoint[];
  height?: number;
  name?: string;
}

interface BlenderRequest {
  buildings: Building[];
  lotSize?: { width: number; depth: number };
  style?: "realistic" | "blueprint" | "minimal";
  outputFormat?: "png" | "blend";
}

// Generate bpy script for Blender from building data
function generateBlenderScript(
  buildings: Building[],
  lotSize: { width: number; depth: number },
  style: string
): string {
  const buildingHeight = 3.0; // Default building height in meters
  const groundOffset = 0.01;
  
  // Generate building geometry creation commands
  const buildingCreates = buildings.map((b, idx) => {
    // Calculate building center and dimensions
    const xs = b.points.map(p => p.x);
    const ys = b.points.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    
    const width = maxX - minX;
    const depth = maxY - minY;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    // Scale to real-world dimensions (assume 100x100 grid = 50m lot)
    const scale = 0.5; // 1 unit = 0.5 meters
    const scaledWidth = width * scale;
    const scaledDepth = depth * scale;
    const scaledCenterX = centerX * scale;
    const scaledCenterY = centerY * scale;
    
    return `
# Building ${idx + 1}: ${b.name || `Building ${idx + 1}`}
bpy.ops.mesh.primitive_cube_add(size=1, location=(${scaledCenterX}, ${scaledCenterY}, ${buildingHeight / 2}))
building = bpy.context.object
building.name = "${b.name || `Building_${idx + 1}`}"
building.scale = (${scaledWidth}, ${scaledDepth}, ${buildingHeight})
bpy.ops.object.shade_smooth()

# Add material
mat = bpy.data.materials.new(name="${b.name || `Building_${idx + 1}`}_mat")
mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"]
${style === "blueprint" 
  ? `bsdf.inputs["Base Color"].default_value = (0.1, 0.2, 0.4, 1)
bsdf.inputs["Roughness"].default_value = 0.8`
  : style === "minimal"
  ? `bsdf.inputs["Base Color"].default_value = (0.9, 0.9, 0.9, 1)
bsdf.inputs["Roughness"].default_value = 0.5`
  : `bsdf.inputs["Base Color"].default_value = (0.8, 0.8, 0.8, 1)
bsdf.inputs["Metallic"].default_value = 0.1
bsdf.inputs["Roughness"].default_value = 0.5`
}
building.data.materials.append(mat)
`;
  }).join("\n");

  // Scale ground plane to lot size
  const lotWidthMeters = lotSize.width * 0.5;
  const lotDepthMeters = lotSize.depth * 0.5;

  return `
import bpy
import math

# Clear existing objects (optional - comment out to keep existing)
# bpy.ops.object.select_all(action='SELECT')
# bpy.ops.object.delete()

# Create ground plane
bpy.ops.mesh.primitive_plane_add(size=1, location=(${lotWidthMeters / 2}, ${lotDepthMeters / 2}, 0))
ground = bpy.context.object
ground.name = "Ground"
ground.scale = (${lotWidthMeters}, ${lotDepthMeters}, 1)

# Ground material
ground_mat = bpy.data.materials.new(name="Ground_mat")
ground_mat.use_nodes = True
ground_bsdf = ground_mat.node_tree.nodes["Principled BSDF"]
${style === "blueprint"
  ? `ground_bsdf.inputs["Base Color"].default_value = (0.05, 0.1, 0.2, 1)`
  : `ground_bsdf.inputs["Base Color"].default_value = (0.3, 0.35, 0.25, 1)  # Grass green`
}
ground_bsdf.inputs["Roughness"].default_value = 0.9
ground.data.materials.append(ground_mat)

${buildingCreates}

# Setup camera
bpy.ops.object.camera_add(location=(${lotWidthMeters / 2}, -${lotDepthMeters * 1.5}, ${lotWidthMeters * 0.5}), rotation=(math.radians(60), 0, math.radians(90)))
camera = bpy.context.object
camera.name = "SiteCamera"
bpy.context.scene.camera = camera

# Setup lighting
bpy.ops.object.light_add(type='SUN', location=(10, 10, 20))
sun = bpy.context.object
sun.name = "Sun"
sun.data.energy = 5

# Set render engine
bpy.context.scene.render.engine = 'CYCLES'
bpy.context.scene.cycles.samples = 128

# Render (only if running interactively - comment out for batch)
# bpy.ops.render.render(write_still=True)

print("Blender script executed successfully!")
`.trim();
}

// Alternative: Generate a simpler Three.js compatible 3D JSON
function generateThreeJsScene(
  buildings: Building[],
  lotSize: { width: number; depth: number }
): object {
  const scale = 0.5; // 1 unit = 0.5 meters
  
  const threeJsBuildings = buildings.map((b, idx) => {
    const xs = b.points.map(p => p.x);
    const ys = b.points.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    
    const width = (maxX - minX) * scale;
    const depth = (maxY - minY) * scale;
    const centerX = ((minX + maxX) / 2) * scale;
    const centerY = ((minY + maxY) / 2) * scale;
    
    return {
      id: idx + 1,
      name: b.name || `Building ${idx + 1}`,
      position: [centerX, centerY, 1.5],
      dimensions: [width, depth, 3],
      color: "#4a90d9"
    };
  });

  return {
    scene: {
      ground: {
        dimensions: [lotSize.width * scale, lotSize.depth * scale],
        color: "#4a5d3a"
      },
      buildings: threeJsBuildings
    },
    camera: {
      position: [lotSize.width * scale * 0.5, -lotSize.depth * scale, 20],
      fov: 50
    },
    lighting: {
      ambient: 0.4,
      directional: {
        position: [10, 10, 20],
        intensity: 0.8
      }
    }
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: BlenderRequest = await request.json();
    const { buildings, lotSize = { width: 100, depth: 100 }, style = "realistic", outputFormat = "png" } = body;

    if (!buildings || buildings.length === 0) {
      return NextResponse.json(
        { error: "Buildings array is required" },
        { status: 400 }
      );
    }

    // Generate the bpy script
    const bpyScript = generateBlenderScript(buildings, lotSize, style);
    
    // Generate Three.js scene data (works immediately in browser)
    const threeJsScene = generateThreeJsScene(buildings, lotSize);

    // Save the bpy script to a file for potential later use
    const scriptsDir = join(process.cwd(), "scripts");
    if (!existsSync(scriptsDir)) {
      await mkdir(scriptsDir, { recursive: true });
    }
    
    const timestamp = Date.now();
    const scriptPath = join(scriptsDir, `site_${timestamp}.py`);
    await writeFile(scriptPath, bpyScript);

    return NextResponse.json({
      success: true,
      message: "Blender script generated successfully",
      data: {
        scriptPath,
        bpyScript,
        threeJsScene,
        outputFormat,
        lotSize,
        buildingCount: buildings.length,
        style
      },
      instructions: {
        blender: `To render in Blender:
1. Open Blender
2. Go to Scripting workspace
3. Open the generated .py file
4. Run script (Alt+P)
5. Render with F12`,
        threeJs: "Three.js scene data ready for browser-based 3D rendering"
      }
    });
  } catch (error) {
    console.error("Error generating Blender script:", error);
    return NextResponse.json(
      { error: "Failed to generate Blender script" },
      { status: 500 }
    );
  }
}
