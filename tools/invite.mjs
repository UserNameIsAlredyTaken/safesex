#!/usr/bin/env node
// Генератор пригласительных ссылок на закрытый раздел ЗППП.
//
//   node tools/invite.mjs "кому выдана" [срок_в_днях]
//
// Печатает готовую ссылку и строку, которую надо вставить в массив STI_INVITES
// в src/App.jsx. В коде сайта хранится ТОЛЬКО SHA-256 отпечаток, сам код — нет,
// поэтому по исходникам ссылку восстановить нельзя.
//
// ВАЖНО: настоящей «одноразовости» тут быть не может — сайт статический, никто не
// считает открытия. Ссылка работает, пока её отпечаток лежит в списке и не вышел
// срок. Отозвать = удалить строку из STI_INVITES и передеплоить.
import { randomBytes, createHash } from "node:crypto";

const note = process.argv[2] || "";
const days = Number(process.argv[3] || 30);
if (!Number.isFinite(days) || days <= 0) {
  console.error("Срок должен быть положительным числом дней.");
  process.exit(1);
}

// 32 символа без похожих (нет 0/o, 1/l): 20 знаков ≈ 100 бит — подобрать нереально.
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // 256 % 32 === 0 → без перекоса
const code = Array.from(randomBytes(20), (b) => ALPHABET[b % 32]).join("");
const hash = createHash("sha256").update(code).digest("hex");
const exp = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

const site = process.env.SITE || "https://sexhealth.info/"; // канонический домен (github.io на него редиректит)
const link = `${site}${site.includes("?") ? "&" : "?"}k=${code}`;

console.log(`\nСсылка (отдать получателю):\n  ${link}`);
console.log(`\nВставить в STI_INVITES в src/App.jsx:`);
console.log(`  { hash: "${hash}", exp: "${exp}", note: ${JSON.stringify(note)} },`);
console.log(`\nДействует до ${exp} включительно. Отозвать — удалить строку и передеплоить.\n`);
