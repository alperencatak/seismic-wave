/* ==========================================================================
   SEISMIC GLOBE — D3.js & HTML5 Canvas Dot Matrix Projection Engine
   ========================================================================== */

class SeismicGlobe {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d', { alpha: true });
        
        // D3 Projection and Path Generator
        this.projection = d3.geoOrthographic()
            .scale(230)
            .translate([this.canvas.width / 2, this.canvas.height / 2])
            .clipAngle(90);
            
        this.path = d3.geoPath()
            .projection(this.projection)
            .context(this.ctx);

        // Core State
        this.countries = null;     // TopoJSON parsed GeoJSON features
        this.hoveredCountry = null; // Currently hovered feature
        this.selectedCountry = null; // Currently clicked/focused feature
        this.earthquakes = [];     // Cached active earthquakes
        this.ripples = [];         // Active visual wave ripples
        this.autoRotate = true;
        this.rotationSpeed = 0.05; // Degrees per frame
        
        // Grid properties for dot globe
        this.dotSpacing = 2.0;       // Grid spacing in degrees
        this.worldDots = [];       // Cached list of dot coordinates [lat, lon, isLand]

        // Drag inertia and interaction state
        this.isDragging = false;
        this.dragStart = [0, 0];
        this.rotationStart = [0, 0];
        
        // Map Projection Animation
        this.transition = null;
        
        // Zoom state
        this.baseScale = 230;
        this.currentScale = 230;
        
        // Country flags mapping
        this.flagMap = {};
        
        this.setupInteractions();
    }

    /**
     * Initializes the globe with parsed GeoJSON features
     */
    init(geojson) {
        this.countries = geojson.features;
        this.generateDotMatrix();
        this.startRenderLoop();
    }

    /**
     * Pre-computes a mathematical grid of dots and determines if they are Land or Ocean
     */
    generateDotMatrix() {
        this.worldDots = [];
        // Loop over the world every N degrees to generate coordinate points
        for (let lat = -80; lat <= 80; lat += this.dotSpacing) {
            for (let lon = -180; lon < 180; lon += this.dotSpacing) {
                const point = [lon, lat];
                let isLand = false;
                
                // Fast checking if the point lies inside any country polygon
                for (let i = 0; i < this.countries.length; i++) {
                    if (d3.geoContains(this.countries[i], point)) {
                        isLand = true;
                        break;
                    }
                }
                
                this.worldDots.push({
                    coords: point,
                    isLand: isLand
                });
            }
        }
    }

    /**
     * Configures mouse drag, hover, and click handlers on the Canvas
     */
    setupInteractions() {
        const self = this;
        
        // Mouse Move (Hover checking)
        d3.select(this.canvas).on('mousemove', function(event) {
            if (self.isDragging || !self.countries) return;
            
            const mouseCoords = d3.pointer(event);
            const geoPoint = self.projection.invert(mouseCoords);
            
            // Check if coordinates fall inside an active projection visible area
            if (!geoPoint || isNaN(geoPoint[0]) || isNaN(geoPoint[1])) {
                self.setHovered(null);
                return;
            }
            
            // Find which country contains the hovered geoPoint
            let match = null;
            for (let i = 0; i < self.countries.length; i++) {
                if (d3.geoContains(self.countries[i], geoPoint)) {
                    match = self.countries[i];
                    break;
                }
            }
            
            self.setHovered(match);
        });

        // Mouse Leave
        d3.select(this.canvas).on('mouseleave', () => {
            this.setHovered(null);
        });

        // D3 Drag Handler for Globe Rotation
        const drag = d3.drag()
            .on('start', function(event) {
                self.isDragging = true;
                
                self.dragStart = [event.x, event.y];
                self.rotationStart = self.projection.rotate();
            })
            .on('drag', function(event) {
                const r = self.projection.rotate();
                const k = 70 / self.projection.scale(); // Sensitivity scaling
                
                // Adjust rotation based on mouse delta
                self.projection.rotate([
                    self.rotationStart[0] + (event.x - self.dragStart[0]) * k,
                    self.rotationStart[1] - (event.y - self.dragStart[1]) * k
                ]);
            })
            .on('end', function() {
                self.isDragging = false;
            });

        d3.select(this.canvas).call(drag);

        // Mouse Wheel Handler for Zoom
        d3.select(this.canvas).on('wheel', (event) => {
            event.preventDefault();
            const zoomSpeed = 0.0015;
            const delta = event.deltaY * zoomSpeed;
            
            this.currentScale *= (1 - delta);
            
            // Constrain zoom between 0.5x and 4x of base scale
            const minScale = this.baseScale * 0.5;
            const maxScale = this.baseScale * 4;
            
            if (this.currentScale < minScale) this.currentScale = minScale;
            if (this.currentScale > maxScale) this.currentScale = maxScale;
            
            this.projection.scale(this.currentScale);
        });

        // Click Handler (Centering and Filtering)
        d3.select(this.canvas).on('click', function(event) {
            // Prevent triggering clicks on subtle drag releases
            if (event.defaultPrevented || !self.countries) return;
            
            const mouseCoords = d3.pointer(event);
            const geoPoint = self.projection.invert(mouseCoords);
            
            if (!geoPoint || isNaN(geoPoint[0]) || isNaN(geoPoint[1])) return;
            
            let clickedCountry = null;
            for (let i = 0; i < self.countries.length; i++) {
                if (d3.geoContains(self.countries[i], geoPoint)) {
                    clickedCountry = self.countries[i];
                    break;
                }
            }
            
            if (clickedCountry) {
                self.selectCountry(clickedCountry);
            }
        });
    }

    /**
     * Handles Hover State change
     */
    setHovered(feature) {
        if (this.hoveredCountry === feature) return;
        this.hoveredCountry = feature;
        
        const tooltip = document.getElementById('globe-tooltip');
        if (feature) {
            tooltip.classList.remove('hide');
            const name = feature.properties.name || "Unknown Land";
            const flag = this.flagMap[name] || this.flagMap[this.resolveCountryAlias(name)] || '🗺️';
            tooltip.textContent = `${flag} ${name}`;
            this.canvas.style.cursor = 'pointer';
        } else {
            tooltip.classList.add('hide');
            this.canvas.style.cursor = this.isDragging ? 'grabbing' : 'grab';
        }
    }

    resolveCountryAlias(name) {
        // Map world-atlas top-level names to standard names for the flag API
        const aliases = {
            "United States of America": "United States",
            "Dem. Rep. Congo": "Congo - Kinshasa",
            "Central African Rep.": "Central African Republic",
            "S. Sudan": "South Sudan",
            "Eq. Guinea": "Equatorial Guinea",
            "Fr. S. Antarctic Lands": "French Southern Territories",
            "Dominican Rep.": "Dominican Republic",
            "Falkland Is.": "Falkland Islands",
            "Solomon Is.": "Solomon Islands",
            "Bosnia and Herz.": "Bosnia & Herzegovina"
        };
        return aliases[name] || name;
    }

    /**
     * Set the responsive base scale of the projection
     */
    setBaseScale(scale) {
        this.baseScale = scale;
        this.currentScale = scale;
        this.projection.scale(scale);
    }

    /**
     * Focuses and slides the globe to center on a country
     */
    selectCountry(feature) {
        this.selectedCountry = feature;
        
        // Dispatch custom event to notify app controller
        const event = new CustomEvent('countrySelected', { detail: feature });
        window.dispatchEvent(event);

        if (feature) {
            const centroid = d3.geoCentroid(feature);
            this.smoothRotateTo(centroid);
        }
    }

    /**
     * Smoothly rotates the projection center to target [longitude, latitude]
     */
    smoothRotateTo(target) {
        const currentRotation = this.projection.rotate();
        const targetRotation = [-target[0], -target[1], currentRotation[2] || 0];

        // Interpolate rotation transitions using D3 transition timer
        const interpolator = d3.interpolate(currentRotation, targetRotation);
        
        if (this.transition) this.transition.stop();

        this.transition = d3.transition()
            .duration(1200)
            .ease(d3.easeCubicOut)
            .tween('rotate', () => {
                return (t) => {
                    this.projection.rotate(interpolator(t));
                };
            });
    }

    /**
     * Updates cached active earthquakes
     */
    updateEarthquakes(features) {
        this.earthquakes = features;
    }

    /**
     * Spawns an animated visual seismic wave ripple
     */
    triggerRipple(coords, mag) {
        // Map magnitude to intensity layers
        let color = 'rgba(245, 158, 11, '; // Low (Yellow)
        if (mag >= 6.0) color = 'rgba(239, 68, 68, '; // High (Red)
        else if (mag >= 4.0) color = 'rgba(244, 63, 94, '; // Med (Coral)
        
        this.ripples.push({
            coords: coords,
            magnitude: mag,
            radius: 1,
            maxRadius: mag * 8 + 8,
            color: color,
            opacity: 1
        });
    }

    /**
     * Checks if a point is visible on the orthographic hemisphere
     */
    isPointVisible(coords) {
        const center = this.projection.invert([this.canvas.width / 2, this.canvas.height / 2]);
        if (!center) return false;
        
        // Angular distance formula (great circle distance <= 90 degrees)
        const d = d3.geoDistance(center, coords);
        return d < Math.PI / 2;
    }

    /**
     * Initiates the drawing/animation frame loop
     */
    startRenderLoop() {
        const render = () => {
            this.draw();
            requestAnimationFrame(render);
        };
        requestAnimationFrame(render);
    }

    /**
     * Master Draw Loop
     */
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Apply auto rotation if enabled
        if (this.autoRotate && !this.isDragging) {
            const rot = this.projection.rotate();
            this.projection.rotate([rot[0] + this.rotationSpeed, rot[1]]);
        }

        // 1. Draw Globe Sphere Atmosphere Background Glow
        this.drawAtmosphere();

        // 2. Draw World Dot Matrix Grid (The Dot Earth)
        this.drawDotMatrixGrid();

        // 3. Draw Country Outlines (Hover & Select highlights)
        this.drawOutlines();

        // 4. Draw Earthquake Epicenter Locations
        this.drawEarthquakes();

        // 5. Draw Pulsating Ripple Waves
        this.drawRipples();
    }

    /**
     * Draws the glowing circular glass backing for the globe sphere
     */
    drawAtmosphere() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        const scale = this.projection.scale();
        
        this.ctx.save();
        
        // Ambient Radial Glow
        const grad = this.ctx.createRadialGradient(width/2, height/2, scale * 0.8, width/2, height/2, scale * 1.15);
        grad.addColorStop(0, 'rgba(15, 23, 42, 0.4)');
        grad.addColorStop(0.7, 'rgba(0, 191, 255, 0.05)');
        grad.addColorStop(1, 'rgba(0, 191, 255, 0)');
        
        this.ctx.beginPath();
        this.ctx.arc(width/2, height/2, scale * 1.2, 0, Math.PI * 2);
        this.ctx.fillStyle = grad;
        this.ctx.fill();

        // Sphere Silhouette Backing
        this.ctx.beginPath();
        this.ctx.arc(width/2, height/2, scale, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(8, 14, 29, 0.65)';
        this.ctx.strokeStyle = 'rgba(0, 191, 255, 0.15)';
        this.ctx.lineWidth = 1;
        this.ctx.fill();
        this.ctx.stroke();
        
        this.ctx.restore();
    }

    /**
     * Renders the pre-computed grid dots mapped onto the Orthographic sphere projection
     */
    drawDotMatrixGrid() {
        this.ctx.save();
        
        for (let i = 0; i < this.worldDots.length; i++) {
            const dot = this.worldDots[i];
            
            // Check if coordinates fall within visible hemisphere
            if (this.isPointVisible(dot.coords)) {
                const projected = this.projection(dot.coords);
                
                // Draw dot
                this.ctx.beginPath();
                this.ctx.arc(projected[0], projected[1], dot.isLand ? 1.4 : 0.6, 0, Math.PI * 2);
                
                if (dot.isLand) {
                    // Bright, high contrast cyber blue dots for landmasses
                    this.ctx.fillStyle = 'rgba(0, 191, 255, 0.35)';
                } else {
                    // Ocean dots are tiny, extremely faint gray/blue
                    this.ctx.fillStyle = 'rgba(71, 85, 105, 0.1)';
                }
                
                this.ctx.fill();
            }
        }
        
        this.ctx.restore();
    }

    /**
     * Draws outlines for Hovered or Selected country features
     */
    drawOutlines() {
        this.ctx.save();

        // Selected Country Glowing Overlay
        if (this.selectedCountry) {
            this.ctx.beginPath();
            this.path(this.selectedCountry);
            this.ctx.fillStyle = 'rgba(0, 191, 255, 0.08)';
            this.ctx.fill();
            this.ctx.strokeStyle = 'rgba(0, 191, 255, 0.5)';
            this.ctx.lineWidth = 1.5;
            this.ctx.shadowColor = 'rgba(0, 191, 255, 0.5)';
            this.ctx.shadowBlur = 8;
            this.ctx.stroke();
            this.ctx.shadowBlur = 0; // reset
        }

        // Hovered Country
        if (this.hoveredCountry && this.hoveredCountry !== this.selectedCountry) {
            this.ctx.beginPath();
            this.path(this.hoveredCountry);
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
            this.ctx.fill();
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
        }

        this.ctx.restore();
    }

    /**
     * Draws static epicenter indicator nodes on the sphere surface
     */
    drawEarthquakes() {
        this.ctx.save();

        this.earthquakes.forEach(eq => {
            const coords = eq.geometry.coordinates;
            
            if (this.isPointVisible(coords)) {
                const projected = this.projection(coords);
                const mag = eq.properties.mag;
                
                // Color mapping
                let fillStyle = 'rgba(245, 158, 11, 0.8)';
                let glowColor = 'rgba(245, 158, 11, 0.4)';
                let size = 3;
                
                if (mag >= 6.0) {
                    fillStyle = 'rgba(239, 68, 68, 0.9)';
                    glowColor = 'rgba(239, 68, 68, 0.6)';
                    size = 6;
                } else if (mag >= 4.0) {
                    fillStyle = 'rgba(244, 63, 94, 0.85)';
                    glowColor = 'rgba(244, 63, 94, 0.5)';
                    size = 4.5;
                }

                // Draw glowing aura
                this.ctx.beginPath();
                this.ctx.arc(projected[0], projected[1], size * 2.2, 0, Math.PI * 2);
                this.ctx.fillStyle = glowColor;
                this.ctx.fill();

                // Draw central core
                this.ctx.beginPath();
                this.ctx.arc(projected[0], projected[1], size, 0, Math.PI * 2);
                this.ctx.fillStyle = fillStyle;
                this.ctx.strokeStyle = '#ffffff';
                this.ctx.lineWidth = 0.8;
                this.ctx.fill();
                this.ctx.stroke();
            }
        });

        this.ctx.restore();
    }

    /**
     * Draws pulsating seismic ripple wave circles
     */
    drawRipples() {
        this.ctx.save();
        
        // Filter and update ripples in one pass
        this.ripples = this.ripples.filter(ripple => {
            if (this.isPointVisible(ripple.coords)) {
                const projected = this.projection(ripple.coords);
                
                // Draw ripple rings
                this.ctx.beginPath();
                this.ctx.arc(projected[0], projected[1], ripple.radius, 0, Math.PI * 2);
                this.ctx.strokeStyle = ripple.color + ripple.opacity + ')';
                this.ctx.lineWidth = 1.2;
                this.ctx.stroke();
            }

            // Animate properties
            ripple.radius += 0.45;
            ripple.opacity = 1 - (ripple.radius / ripple.maxRadius);

            // Keep ripple in list if it hasn't exceeded max bounds
            return ripple.radius < ripple.maxRadius;
        });

        this.ctx.restore();
    }
}

// Bind to window to allow global script scoping
window.SeismicGlobe = SeismicGlobe;
