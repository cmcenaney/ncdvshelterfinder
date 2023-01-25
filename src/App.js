
import React, { useRef, useEffect, useState } from 'react';
import { GoogleSpreadsheet } from "google-spreadsheet";
import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';
import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css';
import data from './assets/counties.geojson';
import mapboxgl from '!mapbox-gl'; // eslint-disable-line import/no-webpack-loader-syntax
mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_API_KEY;

function tooltip(county, ttData) {

    let html = `<h3 class="county-title">${county} County</h3>`

    if (ttData) {
    ttData.forEach((d) => {
        if (d.link){
            const p = d.link.split('//')[1]
        html += `<div class="info"><a href="https://${p}" target="_blank"><p class="dv-title">${d.name}</p></a>`
        } else {
            html += `<div class="info"><p class="dv-title">${d.name}</p>`
        }
        html += `<p class="phone">${d.phone}</p></div>`;
    });
}


    return html;
}

async function gsheet() {
    const SPREADSHEET_ID = process.env.REACT_APP_SPREADSHEET_ID;
    const CLIENT_EMAIL = process.env.REACT_APP_GOOGLE_CLIENT_EMAIL;
    const PRIVATE_KEY = process.env.REACT_APP_GOOGLE_SERVICE_PRIVATE_KEY;

    const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
    await doc.useServiceAccountAuth({
        // env var values are copied from service account credentials generated by google
        // see "Authentication" section in docs for more info
        client_email: CLIENT_EMAIL,
        private_key: PRIVATE_KEY.replace(/\\n/g, '\n'),
      });
    
      await doc.loadInfo(); // loads document properties and worksheets

      const sheet = doc.sheetsByIndex[0];

      const rows = await sheet.getRows();



      const d = {}

      const p = []

      rows.forEach((row) => {
        const l = {}
        l.county = row.county.toLowerCase()
        l.phone = row.phone
        l.name = row.name
        l.link = row.link

        p.push(l)

        d[row.county.toLowerCase()] = {
            'phone': row.phone,
            'name': row.name,
            'link': row.link
        }
      });

      const y = p.reduce(function (r, a) {
        r[a.county] = r[a.county] || [];
        r[a.county].push(a);
        return r;
    }, Object.create(null));

      return y;
}

export default function App() {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const [lng, setLng] = useState(-80);
    const [lat, setLat] = useState(35.4);
    const [zoom, setZoom] = useState(6);

    useEffect(() => {
        if (map.current) return; // initialize map only once

        
        
        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/light-v10',
          center: [lng, lat],
          zoom: zoom,
          
        });

        map.current.addControl(
            new MapboxGeocoder({
            accessToken: mapboxgl.accessToken,
            mapboxgl: mapboxgl,
            zoom: zoom,
            bbox: [-84.32178200052,33.85116926668266,-75.45981513195132,36.5881334409244],

            }).on('result', function(results) {
                const county = results.result.context[2].text.toLowerCase().replace(' county', '');
                const coord = {lng: results.result.center[0], lat: results.result.center[1]}
                console.log(coord)
                const info = gsheet();
                info.then((d) => {
                    new mapboxgl.Popup()
                    .setLngLat(coord)
                    .setHTML(tooltip(county, d[county]))
                    .addTo(map.current);
                });
                
             })
        );
        
        map.current.addControl(
            new mapboxgl.GeolocateControl({
                positionOptions: {
                    enableHighAccuracy: true
                },
                // When active the map will receive updates to the device's location as it changes.
                trackUserLocation: true,
                // Draw an arrow next to the location dot to indicate which direction the device is heading.
                // showUserHeading: true,
                fitBoundsOptions: { maxZoom: zoom}
            })
        );
      });

      useEffect(() => {
        if (!map.current) return; // wait for map to initialize

        map.current.on('move', () => {
          setLng(map.current.getCenter().lng.toFixed(4));
          setLat(map.current.getCenter().lat.toFixed(4));
          setZoom(map.current.getZoom().toFixed(2));
        });

        map.current.on('load', () => {
            map.current.resize();
            /* Add the data to your map as a layer */
            map.current.addSource('counties', {
                type: 'geojson',
                data: data,
                'generateId': true
              });

            map.current.addLayer(
                {
                    id: 'counties',
                    type: 'fill',
                    paint: {
                        'fill-opacity': [
                            'case',
                            ['boolean', ['feature-state', 'hover'], false],
                            0.4,
                            0.2
                            ],
                        "fill-outline-color": "#000",
                        "fill-color": "#000"
                    },
                    source: 'counties'
                },
                'country-label'
            );
        
            map.current.addLayer(
                {
                    id: 'counties-lines',
                    type: 'line',
                    source: 'counties'
                },
                'country-label'
            );

            map.current.addLayer({
                'id': 'poi-labels',
                'type': 'symbol',
                'source': 'counties',
                'layout': {
                    'text-field': ['get', 'CO_NAME'],
                    'text-size': 10
                    // 'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
                    // 'text-radial-offset': 0.5,
                    // 'text-justify': 'auto',
                }
                });

            const info = gsheet();
            info.then((d) => {
            
                
            map.current.on('click', 'counties', (e) => {
                console.log(e.lngLat)
                new mapboxgl.Popup()
                .setLngLat(e.lngLat)
                .setHTML(tooltip(e.features[0].properties.CO_NAME.toLowerCase(), d[e.features[0].properties.CO_NAME.toLowerCase()]))
                .addTo(map.current);
            });

        });
                    
            map.current.on('mouseenter', 'counties', () => {
                map.current.getCanvas().style.cursor = 'pointer';
            });

            let hoveredStateId = null;
            map.current.on('mousemove', 'counties', (e) => {
                if (e.features.length > 0) {
                if (hoveredStateId !== null) {
                map.current.setFeatureState(
                { source: 'counties', id: hoveredStateId },
                { hover: false }
                );
                }
                hoveredStateId = e.features[0].id;
                map.current.setFeatureState(
                { source: 'counties', id: hoveredStateId },
                { hover: true }
                );
                }
                });
            
            map.current.on('mouseleave', 'counties', () => {
                if (hoveredStateId !== null) {
                    map.current.setFeatureState(
                    { source: 'counties', id: hoveredStateId },
                    { hover: false }
                    );
                    }
                    hoveredStateId = null;
                map.current.getCanvas().style.cursor = '';
            });
          });
      });

      return (
        <div>
            <div ref={mapContainer} className="map-container" />
        </div>
        );
}
