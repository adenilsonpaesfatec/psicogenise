/*
 * app.js
 * Script principal.
 * Responsável por: calcular posições das nuvens, criar elementos interativos
 * (botões/gifs/inputs), e comunicar com o backend (sound / submit).
 */

(function(){
	/* Número de nuvens a tentar posicionar; pode ser alterado via data-cloud-count no <body> */
	const COUNT = Number(document.body.dataset.cloudCount) || 4;
	const API_BASE_URL = window.__API_BASE_URL || '';
	const MESSAGE_ENDPOINT = '/api/messages';
	const CLOUD_ENDPOINT = '/api/cloud-inputs';
	const SOUND_ENDPOINT = '/api/sound';
	/* Contadores para gerar ids únicos ao criar elementos dinamicamente */
	let gifButtonIdCounter = 0;
	let textInputIdCounter = 0;
	let submitTokenCounter = 0;
	let soundRequestCounter = 0;

	/* Calcula tamanho base das nuvens com clamp (min / max) a partir da largura do layer */
	function computeSize(layerW) {
		const max = 400;
		const min = 100;
		const size = Math.floor(Math.min(max, Math.max(min, layerW * 0.45)));
		return size;
	}
	const layer = document.getElementById('cloud-layer');
	if (!layer) return;

	/* Detecta sobreposição de dois retângulos {left, top, width, height} */
	function rectsOverlap(a, b) {
		return !(a.left + a.width <= b.left || b.left + b.width <= a.left || a.top + a.height <= b.top || b.top + b.height <= a.top);
	}

	/* Inicializa um botão/gif para comportar-se como controle acessível.
	   Ao ser clicado dispara requestSoundFromBackend. */
	function makeGifButton(el, prefix = 'gif-button') {
		if (!el) return;
		if (!el.id) {
			gifButtonIdCounter += 1;
			el.id = prefix + '-' + gifButtonIdCounter;
		}
		el.tabIndex = 0;
		el.setAttribute('aria-pressed', 'false');
		el.classList.add('gif-button');

		el.addEventListener('click', () => {
			const pressed = el.getAttribute('aria-pressed') === 'true';
			el.setAttribute('aria-pressed', String(!pressed));
			el.classList.toggle('pressed', !pressed);
			requestSoundFromBackend(el);
		});

		// Suporte a teclado (Enter / Space)
		el.addEventListener('keydown', (ev) => {
			if (ev.key === 'Enter' || ev.key === ' ') {
				ev.preventDefault();
				el.click();
			}
		});
	}

	function assignTextInputId(el, prefix = 'textinput') {
		if (!el) return;
		if (!el.id) {
			textInputIdCounter += 1;
			el.id = prefix + '-' + textInputIdCounter;
		}
	}

	function attachEnterLogger(el) {
		if (!el) return;
		el.addEventListener('keydown', (ev) => {
			if (ev.key !== 'Enter') return;
			ev.preventDefault();
			submitInputValue(el);
		});
	}

	/* Constrói URL completa do endpoint baseado em API_BASE_URL (opcional) */
	function buildEndpoint(path) {
		return String(API_BASE_URL || '') + path;
	}

	function resolveMediaUrl(value) {
		if (!value) return '';
		if (/^data:|^blob:|^https?:\/\//i.test(value)) {
			return value;
		}
		return String(API_BASE_URL || '') + value;
	}

	function getInputPayload(inputEl) {
		return {
			id: inputEl.id,
			value: inputEl.value,
			source: inputEl.closest('.card') ? 'main' : 'cloud',
			createdAt: new Date().toISOString(),
		};
	}

	/* Wrapper de fetch com timeout usando AbortController para evitar requests pendentes */
	async function fetchWithTimeout(url, options = {}, timeout = 8000) {
		const controller = new AbortController();
		const id = setTimeout(() => controller.abort(), timeout);
		try {
			const response = await fetch(url, { ...options, signal: controller.signal });
			clearTimeout(id);
			return response;
		} catch (err) {
			clearTimeout(id);
			throw err;
		}
	}

	async function postJson(url, payload) {
		const response = await fetchWithTimeout(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload),
		}, 8000);

		if (!response.ok) {
			throw new Error('HTTP ' + response.status);
		}

		return response;
	}

	/* Envia pedido ao backend para obter áudio e reproduz. Suporta JSON (com url/base64) e blob.
	   Usa fetchWithTimeout, dispara eventos customizados para lifecycle do request. */
	async function requestSoundFromBackend(buttonEl) {
		if (!buttonEl) return;
		const requestId = 'sound-' + (++soundRequestCounter);
		const payload = {
			id: buttonEl.id,
			role: buttonEl.getAttribute('role') || 'button',
			createdAt: new Date().toISOString(),
		};

		buttonEl.dispatchEvent(new CustomEvent('backend:sound:start', {
			bubbles: true,
			detail: { requestId, payload },
		}));

		if (!API_BASE_URL) {
			console.log('Backend de áudio não configurado. Botão pronto para receber som:', payload);
			buttonEl.dispatchEvent(new CustomEvent('backend:sound:skipped', {
				bubbles: true,
				detail: { requestId, payload },
			}));
			return;
		}

		try {
			const endpoint = buildEndpoint(SOUND_ENDPOINT);
			const response = await fetchWithTimeout(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			}, 10000);

			if (!response.ok) {
				throw new Error('HTTP ' + response.status);
			}

			const contentType = response.headers.get('content-type') || '';
			let audioUrl = '';

			if (contentType.includes('application/json')) {
				const data = await response.json();
				audioUrl = resolveMediaUrl(data.audioUrl || data.url || '');
				if (!audioUrl && (data.audioBase64 || data.base64)) {
					const mimeType = data.mimeType || 'audio/mpeg';
					audioUrl = 'data:' + mimeType + ';base64,' + (data.audioBase64 || data.base64);
				}
			} else {
				const blob = await response.blob();
				audioUrl = URL.createObjectURL(blob);
			}

			if (!audioUrl) {
				throw new Error('Resposta sem áudio utilizável');
			}

			const audio = new Audio(audioUrl);
			audio.preload = 'auto';
			// revoga blob URL após término da reprodução para evitar vazamento de memória
			audio.onended = () => {
				try { if (audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl); } catch (e) { /* ignore */ }
			};
			await audio.play();
			console.log('Áudio recebido do backend e reproduzido:', payload);
			buttonEl.dispatchEvent(new CustomEvent('backend:sound:success', {
				bubbles: true,
				detail: { requestId, payload, endpoint, audioUrl },
			}));
		} catch (error) {
			console.error('Falha ao receber/reproduzir o áudio do backend:', error, payload);
			buttonEl.dispatchEvent(new CustomEvent('backend:sound:error', {
				bubbles: true,
				detail: { requestId, payload, error },
			}));
		}
	}

	async function submitInputValue(inputEl) {
		if (!inputEl) return;
		const payload = getInputPayload(inputEl);
		const requestId = 'submit-' + (++submitTokenCounter);
		inputEl.dispatchEvent(new CustomEvent('backend:submit:start', {
			bubbles: true,
			detail: { requestId, payload },
		}));

		if (!API_BASE_URL) {
			console.log('Backend não configurado. Payload pronto para envio:', payload);
			inputEl.dispatchEvent(new CustomEvent('backend:submit:skipped', {
				bubbles: true,
				detail: { requestId, payload },
			}));
			return;
		}

		try {
			const endpoint = payload.source === 'main' ? buildEndpoint(MESSAGE_ENDPOINT) : buildEndpoint(CLOUD_ENDPOINT);
			await postJson(endpoint, payload);
			console.log('Enviado para backend:', payload);
			inputEl.dispatchEvent(new CustomEvent('backend:submit:success', {
				bubbles: true,
				detail: { requestId, payload, endpoint },
			}));
		} catch (error) {
			console.error('Falha ao enviar para o backend:', error, payload);
			inputEl.dispatchEvent(new CustomEvent('backend:submit:error', {
				bubbles: true,
				detail: { requestId, payload, error },
			}));
		}
	}

	function tryPlaceAll(layerW, layerH, SIZE, forbidRects=[]) {
		const placed = [];
		const maxAttempts = 300;

		for (let i = 0; i < COUNT; i++) {
			let attempts = 0;
			let placedRect = null;

			while (attempts < maxAttempts && !placedRect) {
				attempts++;
				const w = SIZE;
				const h = Math.floor(w * 0.6);
				const margin = 8;
				const left = Math.floor(margin + Math.random() * Math.max(1, layerW - w - margin * 2));
				const top = Math.floor(margin + Math.random() * Math.max(1, layerH - h - margin * 2));
				const candidate = { left, top, width: w, height: h };

				let overlap = false;
				for (const p of placed) {
					if (rectsOverlap(p, candidate)) { overlap = true; break; }
				}
				for (const f of forbidRects) {
					if (rectsOverlap(f, candidate)) { overlap = true; break; }
				}

				if (!overlap) placedRect = candidate;
			}

			if (!placedRect) {
				return null;
			}

			placed.push(placedRect);
		}

		return placed;
	}

		/* Renderiza elementos das nuvens no DOM com botão + input em cada nuvem */
		function renderPlaced(placed) {
		layer.innerHTML = '';
		for (const r of placed) {
			const el = document.createElement('div');
			el.className = 'cloud';
			el.style.left = r.left + 'px';
			el.style.top = r.top + 'px';
			el.style.transform = 'rotate(' + (Math.random() * 30 - 15) + 'deg)';

			// create button with gif image before the text input
			const gifBtn = document.createElement('button');
			gifBtn.className = 'cloud-gif-button gif-button';
			gifBtn.setAttribute('aria-pressed', 'false');
			const gifImg = document.createElement('img');
			gifImg.src = 'som.gif';
			gifImg.alt = 'Som';
			gifImg.className = 'cloud-gif';
			gifBtn.appendChild(gifImg);
			// make interactive like a button
			makeGifButton(gifBtn, 'cloud-gif');
			el.appendChild(gifBtn);

			// create text input inside the cloud
			const input = document.createElement('input');
			input.type = 'text';
			input.className = 'cloud-input';
			input.placeholder = 'Digite...';
			input.setAttribute('aria-label', 'Campo de texto na nuvem');
			assignTextInputId(input, 'cloud-input');
			attachEnterLogger(input);
			el.appendChild(input);

			layer.appendChild(el);
		}
	}

	function placeClouds() {
		const layerRect = layer.getBoundingClientRect();
		const layerW = layerRect.width || window.innerWidth;
		const layerH = layerRect.height || window.innerHeight;

		const SIZE = computeSize(layerW);
	document.documentElement.style.setProperty('--cloud-size', SIZE + 'px');

		const maxGlobalRetries = 6;
		let placed = null;
		const cardEl = document.querySelector('.card');
		const forbidRects = [];
		if (cardEl) {
			const cr = cardEl.getBoundingClientRect();
			forbidRects.push({ left: cr.left, top: cr.top, width: cr.width, height: cr.height });
		}
		for (let attempt = 0; attempt < maxGlobalRetries; attempt++) {
			placed = tryPlaceAll(layerW, layerH, SIZE, forbidRects);
			if (placed) break;
		}

		if (placed) {
			renderPlaced(placed);
		} else {
			// as last resort try placing fewer clouds (decrease count)
			for (let c = COUNT - 1; c > 0 && !placed; c--) {
				function tryPlaceC(cn) {
					const placedLocal = [];
					const maxAttempts = 300;
					for (let i = 0; i < cn; i++) {
						let attempts = 0;
						let placedRect = null;
						while (attempts < maxAttempts && !placedRect) {
							attempts++;
							const w = SIZE;
							const h = Math.floor(w * 0.6);
							const margin = 8;
							const left = Math.floor(margin + Math.random() * Math.max(1, layerW - w - margin * 2));
							const top = Math.floor(margin + Math.random() * Math.max(1, layerH - h - margin * 2));
							const candidate = { left, top, width: w, height: h };
							let overlap = false;
							for (const p of placedLocal) {
								if (rectsOverlap(p, candidate)) { overlap = true; break; }
							}
							for (const f of forbidRects) {
								if (rectsOverlap(f, candidate)) { overlap = true; break; }
							}
							if (!overlap) placedRect = candidate;
						}
						if (!placedRect) return null;
						placedLocal.push(placedRect);
					}
					return placedLocal;
				}

				placed = tryPlaceC(c);
			}

			if (placed) {
				renderPlaced(placed);
			} else {
				layer.innerHTML = '';
				console.warn('Não foi possível posicionar todas as nuvens sem sobreposição. Nenhuma nuvem adicionada.');
			}
		}
	}

	// initial placement
	placeClouds();

	// make main card gif (if present) behave like a button as well
	const mainGifBtn = document.querySelector('.card .cloud-gif-button');
	if (mainGifBtn) makeGifButton(mainGifBtn, 'main-gif');

	const mainTextInput = document.querySelector('.card .cloud-input');
	if (mainTextInput) {
		assignTextInputId(mainTextInput, 'main-input');
		attachEnterLogger(mainTextInput);
	}

	let resizeTimer = null;
	window.addEventListener('resize', () => {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(() => placeClouds(), 250);
	});
})();
