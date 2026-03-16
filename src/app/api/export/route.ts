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

interface ExportRequest {
  buildings: Building[];
  lotSize?: { width: number; depth: number };
  style?: "realistic" | "blueprint" | "minimal" | "architectural" | "bw";
  format?: "svg" | "dxf" | "png" | "pdf" | "blend";
  scale?: number; // pixels per meter
  includeDimensions?: boolean;
  includeNorthArrow?: boolean;
  includeScaleBar?: boolean;
  includeLabels?: boolean;
}

// Generate styled SVG based on selected style
function generateStyledSvg(
  buildings: Building[],
  lotSize: { width: number; depth: number },
  style: string,
  options: {
    includeDimensions: boolean;
    includeNorthArrow: boolean;
    includeScaleBar: boolean;
    includeLabels: boolean;
    scale: number;
  }
): string {
  const viewBox = "0 0 100 100";
  const scale = options.scale || 50; // pixels per meter
  
  // Style configurations
  const styles: Record<string, { bg: string; stroke: string; fill: string; text: string; grid: string }> = {
    blueprint: {
      bg: "#1a3a5c",
      stroke: "#4a90d9",
      fill: "rgba(74, 144, 217, 0.2)",
      text: "#8ec8f0",
      grid: "rgba(74, 144, 217, 0.15)"
    },
    bw: {
      bg: "#ffffff",
      stroke: "#000000",
      fill: "rgba(0, 0, 0, 0.1)",
      text: "#000000",
      grid: "rgba(0, 0, 0, 0.1)"
    },
    architectural: {
      bg: "#f5f5f0",
      stroke: "#2d2d2d",
      fill: "rgba(45, 45, 45, 0.15)",
      text: "#2d2d2d",
      grid: "rgba(45, 45, 45, 0.08)"
    },
    minimal: {
      bg: "#fafafa",
      stroke: "#333333",
      fill: "transparent",
      text: "#666666",
      grid: "rgba(0, 0, 0, 0.05)"
    },
    realistic: {
      bg: "#f0f0e8",
      stroke: "#4a5568",
      fill: "rgba(74, 85, 104, 0.2)",
      text: "#2d3748",
      grid: "rgba(0, 0, 0, 0.06)"
    }
  };
  
  const s = styles[style] || styles.realistic;
  
  // Generate building paths with dimensions
  let paths = buildings.map((building, idx) => {
    const points = building.points.map(p => `${p.x},${p.y}`).join(" ");
    const buildingName = building.name || `B${idx + 1}`;
    
    let content = `
      <polygon 
        points="${points}" 
        fill="${s.fill}" 
        stroke="${s.stroke}" 
        stroke-width="0.5"
      />
    `;
    
    // Add label
    if (options.includeLabels) {
      const centroid = building.points.reduce(
        (acc, p) => ({ x: acc.x + p.x / building.points.length, y: acc.y + p.y / building.points.length }),
        { x: 0, y: 0 }
      );
      content += `
        <text x="${centroid.x}" y="${centroid.y}" 
          font-size="3" fill="${s.text}" text-anchor="middle" dominant-baseline="middle">
          ${buildingName}
        </text>
      `;
    }
    
    // Add dimensions
    if (options.includeDimensions && building.points.length >= 2) {
      const p1 = building.points[0];
      const p2 = building.points[1];
      const width = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
      const realWidth = (width / 100 * lotSize.width).toFixed(1);
      
      content += `
        <line x1="${p1.x}" y1="${p1.y - 3}" x2="${p2.x}" y2="${p2.y - 3}"
          stroke="${s.text}" stroke-width="0.2" stroke-dasharray="1,0.5" />
        <text x="${(p1.x + p2.x) / 2}" y="${(p1.y + p2.y) / 2 - 4}" 
          font-size="2" fill="${s.text}" text-anchor="middle">
          ${realWidth}m
        </text>
      `;
    }
    
    return content;
  }).join("\n");

  // North arrow
  const northArrow = options.includeNorthArrow ? `
    <g transform="translate(90, 10)">
      <polygon points="0,-8 3,0 -3,0" fill="${s.stroke}" />
      <text x="0" y="-10" font-size="3" fill="${s.text}" text-anchor="middle">N</text>
    </g>
  ` : "";

  // Scale bar
  const scaleBar = options.includeScaleBar ? `
    <g transform="translate(10, 93)">
      <line x1="0" y1="0" x2="10" y2="0" stroke="${s.stroke}" stroke-width="0.5" />
      <line x1="0" y1="-2" x2="0" y2="2" stroke="${s.stroke}" stroke-width="0.5" />
      <line x1="10" y1="-2" x2="10" y2="2" stroke="${s.stroke}" stroke-width="0.5" />
      <text x="5" y="4" font-size="2" fill="${s.text}" text-anchor="middle">
        ${(10 / 100 * lotSize.width).toFixed(0)}m
      </text>
    </g>
  ` : "";

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" 
      style="background-color: ${s.bg}; width: 100%; height: 100%;">
      <defs>
        <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M 10 0 L 0 0 0 10" fill="none" stroke="${s.grid}" stroke-width="0.2"/>
        </pattern>
      </defs>
      <rect width="100" height="100" fill="url(#grid)" />
      
      <!-- Property boundary -->
      <rect x="5" y="5" width="90" height="90" 
        fill="none" stroke="${s.stroke}" stroke-width="0.5" stroke-dasharray="2,1"/>
      
      <!-- Buildings -->
      ${paths}
      
      <!-- North Arrow -->
      ${northArrow}
      
      <!-- Scale Bar -->
      ${scaleBar}
      
      <!-- Legend -->
      <text x="5" y="97" font-size="2.5" fill="${s.text}">Generated by HYLO-SP</text>
    </svg>
  `.trim();
}

// Generate DXF content
function generateDxf(
  buildings: Building[],
  lotSize: { width: number; depth: number }
): string {
  const scale = lotSize.width / 100;
  
  let dxf = `0
SECTION
2
ENTITIES
0
`;
  
  // Property boundary
  dxf += `0
LWPOLYLINE
5
1
330
0
100
AcDbEntity
8
0
100
AcDbPolyline
90
4
70
1
43
0
10
${5 * scale}
20
${5 * scale}
10
${95 * scale}
20
${5 * scale}
10
${95 * scale}
20
${95 * scale}
10
${5 * scale}
20
${95 * scale}
0
`;
  
  // Buildings
  buildings.forEach((building, idx) => {
    const layerName = building.name || `BUILDING_${idx + 1}`;
    dxf += `0
LWPOLYLINE
5
${idx + 10}
330
0
100
AcDbEntity
8
${layerName}
100
AcDbPolyline
90
${building.points.length}
70
1
43
0
`;
    
    building.points.forEach(p => {
      dxf += `10
${p.x * scale}
20
${p.y * scale}
`;
    });
    
    dxf += `0
`;
  });
  
  dxf += `0
ENDSEC
0
EOF
`;
  
  return dxf;
}

// Generate PDF content (simplified - returns SVG that can be printed to PDF)
function generatePdf(
  buildings: Building[],
  lotSize: { width: number; depth: number },
  style: string
): string {
  // Return SVG that can be easily converted to PDF
  return generateStyledSvg(buildings, lotSize, style, {
    includeDimensions: true,
    includeNorthArrow: true,
    includeScaleBar: true,
    includeLabels: true,
    scale: 50
  });
}

export async function POST(request: NextRequest) {
  try {
    const body: ExportRequest = await request.json();
    const { 
      buildings, 
      lotSize = { width: 100, depth: 100 }, 
      style = "realistic",
      format = "svg",
      includeDimensions = true,
      includeNorthArrow = true,
      includeScaleBar = true,
      includeLabels = true,
      scale = 50
    } = body;

    if (!buildings || buildings.length === 0) {
      return NextResponse.json(
        { error: "Buildings array is required" },
        { status: 400 }
      );
    }

    let output: string;
    let contentType: string;
    let filename: string;

    switch (format) {
      case "svg":
        output = generateStyledSvg(buildings, lotSize, style, {
          includeDimensions,
          includeNorthArrow,
          includeScaleBar,
          includeLabels,
          scale
        });
        contentType = "image/svg+xml";
        filename = `site-plan-${style}.svg`;
        break;
        
      case "dxf":
        output = generateDxf(buildings, lotSize);
        contentType = "application/dxf";
        filename = `site-plan.dxf`;
        break;
        
      case "pdf":
        output = generateStyledSvg(buildings, lotSize, style, {
          includeDimensions,
          includeNorthArrow,
          includeScaleBar,
          includeLabels,
          scale
        });
        // Note: True PDF requires a library like pdfkit
        // For now, return SVG that browsers can print to PDF
        contentType = "image/svg+xml";
        filename = `site-plan-${style}.svg`;
        break;
        
      case "png":
        // Return SVG - user can convert or we could add sharp library
        output = generateStyledSvg(buildings, lotSize, style, {
          includeDimensions,
          includeNorthArrow,
          includeScaleBar,
          includeLabels,
          scale
        });
        contentType = "image/svg+xml";
        filename = `site-plan-${style}.svg`;
        break;
        
      case "blend":
        // Return Blender Python script
        output = `# HYLO-SP Blender Export
# Buildings: ${buildings.length}
# Style: ${style}
# Lot Size: ${lotSize.width}m x ${lotSize.depth}m

import bpy

# Clear scene
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# Add ground plane
bpy.ops.mesh.primitive_plane_add(size=${Math.max(lotSize.width, lotSize.depth)})
ground = bpy.context.object
ground.name = "Ground"

# Add buildings
${buildings.map((b, i) => `
# Building ${i + 1}: ${b.name || `Building_${i + 1}`}
bpy.ops.mesh.primitive_cube_add(size=1, location=(${b.points[0]?.x || 0}, ${b.points[0]?.y || 0}, 1.5))
building = bpy.context.object
building.name = "${b.name || `Building_${i + 1}`}"
building.scale = (${b.points[1]?.x ? (b.points[1].x - b.points[0].x) * lotSize.width / 100 : 5}, ${b.points[1]?.y ? (b.points[1].y - b.points[0].y) * lotSize.depth / 100 : 5}, 3)
`).join('\n')}

print("Scene created from HYLO-SP export")
`;
        contentType = "text/x-python";
        filename = `site-plan.blend.py`;
        break;
        
      default:
        return NextResponse.json(
          { error: `Unsupported format: ${format}` },
          { status: 400 }
        );
    }

    // Save to file
    const exportsDir = join(process.cwd(), "exports");
    if (!existsSync(exportsDir)) {
      await mkdir(exportsDir, { recursive: true });
    }
    
    const timestamp = Date.now();
    const filePath = join(exportsDir, `${timestamp}-${filename}`);
    await writeFile(filePath, output);

    return NextResponse.json({
      success: true,
      data: {
        filename,
        format,
        style,
        buildingCount: buildings.length,
        lotSize,
        options: {
          includeDimensions,
          includeNorthArrow,
          includeScaleBar,
          includeLabels
        }
      },
      // Return the content directly for immediate download
      content: output,
      contentType,
      downloadUrl: `/exports/${timestamp}-${filename}`
    });
  } catch (error) {
    console.error("Error generating export:", error);
    return NextResponse.json(
      { error: "Failed to generate export" },
      { status: 500 }
    );
  }
}
