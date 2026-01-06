
document.addEventListener("DOMContentLoaded", () => {
    const mainContentArea = document.getElementById("main-content-area");
    const sectionCount = 23; // 23 sections

    // Function to load a single section
    async function loadSection(index) {
        const fileName = `section-${String(index).padStart(2, '0')}.html`;
        try {
            const response = await fetch(`sections/${fileName}`);
            if (!response.ok) throw new Error(`Failed to load ${fileName}`);
            const html = await response.text();
            mainContentArea.insertAdjacentHTML('beforeend', html);
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
        // After loading all sections, initialize the original logic (ToC, Gallery, etc.)
        initializeOriginalLogic();
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

        // 画像の遅延読み込み処理
        function initLazyLoadImages() {
            const images = document.querySelectorAll('.feature-image img');

            images.forEach(img => {
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
