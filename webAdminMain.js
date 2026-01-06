
document.addEventListener("DOMContentLoaded", () => {
    console.log('=== DEBUG: Script Starting ===');

    // Get elements after DOM is ready
    mainContentArea = document.getElementById("main-content-area");
    loadingOverlay = document.getElementById("loading-overlay");
    loadingProgress = document.getElementById("loading-progress");
    loadingText = document.getElementById("loading-text");

    console.log('Loading overlay element:', loadingOverlay);
    console.log('Loading progress element:', loadingProgress);
    console.log('Loading text element:', loadingText);
    console.log('Main content area:', mainContentArea);

    const sectionCount = 16; // 16 sections for Web Admin

    // Force loading overlay to show immediately
    if (loadingOverlay) {
        loadingOverlay.style.display = 'flex';
        console.log('Loading overlay display set to:', loadingOverlay.style.display);
    }

    // Function to load a single section
    async function loadSection(index) {
        const fileName = `section-${String(index).padStart(2, '0')}.html`;
        try {
            const response = await fetch(`webAdminSections/${fileName}`);
            if (!response.ok) throw new Error(`Failed to load ${fileName}`);
            const html = await response.text();
            mainContentArea.insertAdjacentHTML('beforeend', html);

            // Update progress
            const progress = (index / sectionCount) * 100;
            if (loadingProgress) {
                loadingProgress.style.width = progress + '%';
            }
            if (loadingText) {
                loadingText.textContent = `セクション ${index}/${sectionCount} を読み込み中...`;
            }

            // Add small delay to see loading (REMOVE IN PRODUCTION)
            await new Promise(resolve => setTimeout(resolve, 100));

            return true;
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    // Load all sections sequentially
    async function loadAllSections() {
        for (let i = 1; i <= sectionCount; i++) {
            await loadSection(i);
        }


        // Initialize original logic (ToC, Gallery, etc.) BEFORE hiding loader
        try {
            initializeOriginalLogic();
        } catch (e) {
            console.error("Error initializing logic:", e);
        }

        // All sections loaded and logic initialized, hide loading overlay
        if (loadingText) loadingText.textContent = '読み込み完了！';

        // Use a small timeout to ensure UI updates have processed
        setTimeout(() => {
            if (loadingOverlay) {
                loadingOverlay.classList.add('fade-out');
                setTimeout(() => {
                    // Remove the element completely from DOM as requested
                    if (loadingOverlay.parentNode) {
                        loadingOverlay.parentNode.removeChild(loadingOverlay);
                    }
                    console.log('Loading overlay removed');
                }, 300);
            }
        }, 500); // Increased delay slightly to be safe
    }

    function initializeOriginalLogic() {
        // --- Original Logic Starts Here ---
        const galleryModal = document.getElementById("galleryModal");
        const galleryImage = document.getElementById("galleryImage");
        const galleryClose = document.querySelector(".gallery-close");

        window.openGallery = (imageId) => {
            const sourceImage = document.getElementById(imageId);
            if (!sourceImage || !sourceImage.src.includes("path/to")) {
                galleryImage.src = sourceImage.src;
                galleryModal.classList.add("active");
                document.addEventListener("keydown", handleGalleryKeydown);
            }
        };

        const closeGallery = () => {
            galleryModal.classList.remove("active");
            document.removeEventListener("keydown", handleGalleryKeydown);
        };

        const handleGalleryKeydown = (e) => {
            if (e.key === "Escape") closeGallery();
        };

        if (galleryClose) galleryClose.addEventListener("click", closeGallery);
        if (galleryModal)
            galleryModal.addEventListener("click", (e) => {
                if (e.target === galleryModal) closeGallery();
            });

        const sidebar = document.getElementById("sidebar");
        const hamburger = document.getElementById("hamburger-menu");
        const overlay = document.getElementById("overlay");
        const mainContentArea = document.getElementById("main-content-area");

        if (hamburger)
            hamburger.addEventListener("click", () => {
                sidebar.classList.toggle("open");
                overlay.classList.toggle("open");
            });
        if (overlay)
            overlay.addEventListener("click", () => {
                sidebar.classList.remove("open");
                overlay.classList.remove("open");
            });
        if (mainContentArea)
            mainContentArea.addEventListener("click", () => {
                if (sidebar.classList.contains("open")) {
                    sidebar.classList.remove("open");
                    overlay.classList.remove("open");
                }
            });

        const tocContainer = document.getElementById("toc");

        function generateToc() {
            if (!tocContainer || !mainContentArea) return;
            let tocHTML = "<ul>";
            mainContentArea
                .querySelectorAll(".manual-section")
                .forEach((section) => {
                    const id = section.id;
                    const h2Element = section.querySelector("h2");
                    if (!h2Element) return; // h2がない場合はスキップ

                    const title = h2Element.textContent;
                    tocHTML += `<li><a href="#${id}">${title}</a><ul>`;
                    section
                        .querySelectorAll(".manual-subsection")
                        .forEach((subsection) => {
                            const subId = subsection.id;
                            const h3Element = subsection.querySelector("h3");
                            if (!h3Element) return; // h3がない場合はスキップ

                            const subTitle = h3Element.textContent;
                            tocHTML += `<li><a href="#${subId}">${subTitle}</a></li>`;
                        });
                    tocHTML += `</ul></li>`;
                });
            tocHTML += "</ul>";
            tocContainer.innerHTML = tocHTML;

            const tocLinks = tocContainer.querySelectorAll("a");
            tocContainer.addEventListener("click", (e) => {
                if (e.target.tagName === "A") {
                    e.preventDefault();
                    sidebar.classList.remove("open");
                    overlay.classList.remove("open");
                    const targetId = e.target.getAttribute("href");
                    const targetElement = document.querySelector(targetId);
                    if (targetElement) {
                        const offsetTop =
                            targetElement.getBoundingClientRect().top +
                            window.pageYOffset -
                            (65 + 20);
                        window.scrollTo({ top: offsetTop, behavior: "smooth" });
                    }
                }
            });
        }

        const observer = new IntersectionObserver(
            (entries) => {
                let bestVisible = null;
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        if (
                            !bestVisible ||
                            entry.intersectionRatio > bestVisible.intersectionRatio
                        ) {
                            bestVisible = entry;
                        }
                    }
                });

                if (bestVisible) {
                    const tocLinks = tocContainer.querySelectorAll("a");
                    tocLinks.forEach((link) => link.classList.remove("active"));
                    const id = bestVisible.target.getAttribute("id");
                    const correspondingLink = tocContainer.querySelector(
                        `a[href="#${id}"]`
                    );
                    if (correspondingLink) {
                        correspondingLink.classList.add("active");
                        let parentUl = correspondingLink.closest("ul");
                        if (
                            parentUl &&
                            parentUl.previousElementSibling?.tagName === "A"
                        ) {
                            parentUl.previousElementSibling.classList.add("active");
                        }
                    }
                }
            },
            { rootMargin: `-${85}px 0px -50% 0px`, threshold: [0.1, 0.5] }
        );

        function observeSections() {
            mainContentArea
                .querySelectorAll(".manual-section, .manual-subsection")
                .forEach((section) => observer.observe(section));
        }

        // Use a MutationObserver to regenerate ToC and re-observe when content changes
        const mutationObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === "childList") {
                    generateToc();
                    observeSections();
                    break;
                }
            }
        });

        mutationObserver.observe(mainContentArea, { childList: true });

        // Initial generation
        generateToc();
        observeSections();

        // 画像の遅延読み込み処理（Intersection Observer使用）
        function initLazyLoadImages() {
            const images = document.querySelectorAll('.feature-image img');

            // Intersection Observer for lazy loading
            const lazyImageObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;

                        // 画像読み込み完了時の処理
                        img.addEventListener('load', function () {
                            this.setAttribute('data-loaded', 'true');
                        });

                        // 画像読み込みエラー時の処理
                        img.addEventListener('error', function () {
                            this.setAttribute('data-error', 'true');
                            this.setAttribute('data-loaded', 'true');
                            console.warn(`画像の読み込みに失敗しました: ${this.src}`);
                        });

                        // 既に読み込まれている画像の処理
                        if (img.complete) {
                            if (img.naturalHeight !== 0) {
                                img.setAttribute('data-loaded', 'true');
                            } else {
                                img.setAttribute('data-error', 'true');
                                img.setAttribute('data-loaded', 'true');
                            }
                        }

                        // 監視を停止
                        observer.unobserve(img);
                    }
                });
            }, {
                rootMargin: '50px' // 画面に入る50px前から読み込み開始
            });

            images.forEach(img => {
                lazyImageObserver.observe(img);
            });
        }

        // 初期化
        initLazyLoadImages();

        // コンテンツが動的に追加された場合にも対応
        const imageObserver = new MutationObserver(() => {
            initLazyLoadImages();
        });

        imageObserver.observe(mainContentArea, {
            childList: true,
            subtree: true
        });
        // --- Original Logic Ends Here ---
    }

    loadAllSections();
});
