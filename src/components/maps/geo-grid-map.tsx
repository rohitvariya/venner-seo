"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { GridPoint } from "@/lib/schema";
import { rankColor } from "@/lib/maps/colors";

/** Map of geo-grid points, each a numbered circle coloured by Maps rank. */
export function GeoGridMap({ center, points, name }: { center: { lat: number; lng: number }; points: GridPoint[]; name: string }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !el.current) return;
      map = L.map(el.current, { scrollWheelZoom: false, attributionControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      const bounds = L.latLngBounds([[center.lat, center.lng]]);
      for (const p of points) {
        bounds.extend([p.lat, p.lng]);
        const label = p.rank === null ? "20+" : String(p.rank);
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:34px;height:34px;border-radius:9999px;background:${rankColor(p.rank)};color:#fff;font:600 12px/34px system-ui;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.35);border:2px solid #fff">${label}</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        const top = p.top.length ? `<br/><span style="color:#64748b">Top results here:</span><br/>${p.top.map((t, i) => `${i + 1}. ${t.replace(/</g, "&lt;")}`).join("<br/>")}` : "";
        L.marker([p.lat, p.lng], { icon })
          .bindPopup(`<b>${p.rank === null ? "Not in the top 20" : `#${p.rank} on Google Maps`}</b>${top}`)
          .addTo(map);
      }
      L.circleMarker([center.lat, center.lng], { radius: 6, color: "#4f46e5", fillColor: "#4f46e5", fillOpacity: 1 })
        .bindTooltip(name)
        .addTo(map);
      map.fitBounds(bounds.pad(0.15));
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [center.lat, center.lng, points, name]);
  return <div ref={el} className="h-[420px] w-full overflow-hidden rounded-xl border" />;
}
