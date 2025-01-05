// 图片上传相关函数
function initializeImageUpload() {
    const fileInput = document.getElementById('fileInput');
    const progressBar = document.querySelector('.progress-bar');
    const progress = document.querySelector('.progress');

    fileInput.addEventListener('change', handleImageUpload);
}

// 优化的图片压缩函数
async function compressImage(file, targetSize = 200) { // targetSize in KB
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = function(event) {
            const img = new Image();
            img.src = event.target.result;
            img.onload = async function() {
                try {
                    const compressedDataUrl = await smartCompress(img, file.size, targetSize * 1024);
                    console.log(`压缩前: ${Math.round(file.size / 1024)}KB, 压缩后: ${Math.round(compressedDataUrl.length / 1.37 / 1024)}KB`);
                    resolve(compressedDataUrl);
                } catch (err) {
                    reject(err);
                }
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
}

// 优化智能压缩函数
async function smartCompress(img, originalSize, targetSize) {
    // 初始化参数
    let maxWidth = img.width;
    let maxHeight = img.height;
    let quality = 0.9;
    
    // 如果原始尺寸太大，先进行尺寸压缩
    const maxDimension = Math.min(2048, Math.max(maxWidth, maxHeight)); // 根据原始尺寸动态调整
    if (maxWidth > maxDimension || maxHeight > maxDimension) {
        const ratio = Math.min(maxDimension / maxWidth, maxDimension / maxHeight);
        maxWidth = Math.round(maxWidth * ratio);
        maxHeight = Math.round(maxHeight * ratio);
    }

    // 使用 createImageBitmap 优化性能
    const imageBitmap = await createImageBitmap(img);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // 使用二分法查找最佳质量参数
    let minQuality = 0.1;
    let maxQuality = 1;
    let bestDataUrl = null;
    let bestSize = Infinity;
    let attempts = 0;
    const maxAttempts = 8;

    while (attempts < maxAttempts) {
        quality = (minQuality + maxQuality) / 2;
        
        canvas.width = maxWidth;
        canvas.height = maxHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imageBitmap, 0, 0, maxWidth, maxHeight);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const currentSize = dataUrl.length / 1.37;

        if (Math.abs(currentSize - targetSize) < Math.abs(bestSize - targetSize)) {
            bestDataUrl = dataUrl;
            bestSize = currentSize;
        }

        if (currentSize > targetSize) {
            maxQuality = quality;
        } else {
            minQuality = quality;
        }

        if (Math.abs(currentSize - targetSize) / targetSize < 0.1) {
            break;
        }

        attempts++;
    }

    imageBitmap.close(); // 释放资源
    return bestDataUrl;
}

// 修改handleImageUpload函数
async function handleImageUpload(event) {
    console.log('开始处理图片上传...');
    const files = event.target.files;
    console.log('选择的文件:', files);
    
    if (!files.length) {
        console.log('没有选择文件');
        return;
    }

    const progressBar = document.querySelector('.progress-bar');
    const progress = document.querySelector('.progress');
    progressBar.style.display = 'block';

    try {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            console.log('处理文件:', file.name);
            
            if (!file.type.startsWith('image/')) {
                console.log('不是图片文件:', file.type);
                continue;
            }

            const code = file.name.split('.')[0];
            console.log('商品编码:', code);

            try {
                // 压缩图片
                const targetSize = file.size > 1024 * 1024 ? 200 : 100;
                console.log('开始压缩图片...');
                const compressedImageUrl = await compressImage(file, targetSize);
                console.log('图片压缩完成');

                // 更新进度
                const percent = ((i + 1) / files.length) * 100;
                progress.style.width = percent + '%';

                // 保存到 IndexedDB
                await saveImageToDB(code, compressedImageUrl);
                console.log('图片保存成功');

                // 更新显示
                await updateImageGrid();
                console.log('图片网格更新完成');
            } catch (err) {
                console.error('处理单个文件时出错:', err);
                alert(`处理文件 ${file.name} 时出错: ${err.message}`);
            }
        }
    } catch (error) {
        console.error('图片上传失败:', error);
        alert('图片上传失败，请重试: ' + error.message);
    } finally {
        progressBar.style.display = 'none';
        progress.style.width = '0%';
        event.target.value = '';
    }
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        console.log('创建FileReader...');
        const reader = new FileReader();
        
        reader.onload = () => {
            console.log('FileReader加载完成');
            resolve(reader.result);
        };
        
        reader.onerror = (error) => {
            console.error('FileReader错误:', error);
            reject(new Error('读取文件失败'));
        };
        
        try {
            reader.readAsDataURL(file);
            console.log('开始读取文件...');
        } catch (error) {
            console.error('调用readAsDataURL时出错:', error);
            reject(error);
        }
    });
}

function saveImageData(code, imageUrl) {
    try {
        console.log('开始保存图片数据...');
        let imageData = {};
        
        try {
            const stored = localStorage.getItem('imageData');
            if (stored) {
                imageData = JSON.parse(stored);
            }
        } catch (error) {
            console.error('解析已存储的imageData失败:', error);
            imageData = {};
        }

        imageData[code] = {
            url: imageUrl,
            timestamp: new Date().toISOString(),
            code: code
        };

        try {
            localStorage.setItem('imageData', JSON.stringify(imageData));
            console.log('图片数据保存成功');
        } catch (error) {
            console.error('保存到localStorage失败:', error);
            if (error.name === 'QuotaExceededError') {
                alert('存储空间已满，请清理一些数据后重试');
            } else {
                throw error;
            }
        }
    } catch (error) {
        console.error('保存图片数据时出错:', error);
        throw error;
    }
}

// 添加 IndexedDB 数
const DB_NAME = 'ImageLibraryDB';
const DB_VERSION = 1;
let db;

// 修改数据库初始化函数
function initDB() {
    return new Promise((resolve, reject) => {
        try {
            // 直接打开�������������������据库，不删除旧数据
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error('数据库打开失败:', event.target.error);
                reject(new Error('数据库打开失败，请刷新页面重试'));
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                console.log('数据库打开成功');
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                // 只在数据库不存在时创建存储
                if (!db.objectStoreNames.contains('images')) {
                    const imageStore = db.createObjectStore('images', { keyPath: 'id' });
                    imageStore.createIndex('code', 'code', { unique: false });
                    imageStore.createIndex('supplier', 'supplier', { unique: false });
                    imageStore.createIndex('timestamp', 'timestamp', { unique: false });
                    console.log('数据库结构创建成功');
                }
            };
        } catch (error) {
            console.error('数据库初始化错误:', error);
            reject(error);
        }
    });
}

// 保存图片到 IndexedDB
async function saveImageToDB(code, imageUrl, supplier = '') {
    await ensureDBConnection();
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction(['images'], 'readwrite');
            const store = transaction.objectStore('images');
            
            // 使用编码和供应商组合作为唯一标识
            const uniqueId = `${code}_${supplier}`;
            
            const imageData = {
                id: uniqueId,
                code: code,
                supplier: supplier,
                file: imageUrl,
                timestamp: new Date().toISOString()
            };
            
            const request = store.put(imageData);
            
            request.onsuccess = () => {
                console.log('图片保存到 IndexedDB 成功');
                resolve();
            };
            
            request.onerror = () => {
                console.error('保存到 IndexedDB 失败:', request.error);
                reject(request.error);
            };
        } catch (error) {
            console.error('创建事务失败:', error);
            reject(error);
        }
    });
}

// 从 IndexedDB 获取图片
async function getImageFromDB(code, supplier) {
    await ensureDBConnection();
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction(['images'], 'readonly');
            const store = transaction.objectStore('images');
            // 使用组合ID查询
            const uniqueId = `${code}_${supplier}`;
            console.log('正在查询图片:', uniqueId);
            
            const request = store.get(uniqueId);
            
            request.onsuccess = () => {
                const result = request.result;
                console.log('查询结果:', result);
                resolve(result);
            };
            
            request.onerror = (error) => {
                console.error('查询图片失败:', error);
                reject(error);
            };
        } catch (error) {
            console.error('获取图片事务失败:', error);
            reject(error);
        }
    });
}

// 修改 updateImageGrid 函数
async function updateImageGrid() {
    await ensureDBConnection();
    const imageGrid = document.getElementById('imageGrid');
    const productData = JSON.parse(localStorage.getItem('productData') || '{}');
    
    // 使用 DocumentFragment 减少DOM操作
    const fragment = document.createDocumentFragment();
    const supplierGroups = {};

    try {
        const transaction = db.transaction(['images'], 'readonly');
        const store = transaction.objectStore('images');
        const images = await new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        // 使用 Map 优化查找性能
        const productMap = new Map(Object.entries(productData));

        images.forEach(image => {
            const uniqueId = `${image.code}_${image.supplier}`;
            const product = productMap.get(uniqueId) || {};
            const supplier = product.supplier || '未分类';
            
            if (!supplierGroups[supplier]) {
                supplierGroups[supplier] = [];
            }
            
            supplierGroups[supplier].push({...image, ...product});
        });

        Object.entries(supplierGroups).forEach(([supplier, images]) => {
            const supplierGroup = document.createElement('div');
            supplierGroup.className = 'supplier-group';
            supplierGroup.setAttribute('data-supplier', supplier);
            
            // 使用模板字符串优化HTML生成
            supplierGroup.innerHTML = `
                <div class="supplier-title">
                    <div class="supplier-title-left">
                        <span>${supplier}</span>
                        <span class="count">${images.length}个商品</span>
                    </div>
                    <button class="add-new-btn" onclick="openNewItemForm('${supplier}')">添加新款</button>
                </div>
                <div class="supplier-images"></div>
            `;
            
            const imagesDiv = supplierGroup.querySelector('.supplier-images');
            images.forEach(image => {
                imagesDiv.appendChild(createImageItem(image));
            });
            
            fragment.appendChild(supplierGroup);
        });

        imageGrid.innerHTML = '';
        imageGrid.appendChild(fragment);
        
        const savedColumns = localStorage.getItem('gridColumns') || 6;
        updateGridColumns(savedColumns);

        // 添加这一行，更新供应商导航
        updateSupplierNav();
        
    } catch (error) {
        console.error('更新图片网格失败:', error);
        alert('更新图片网格失败，请刷新页面重试');
    }
}

// 修改商品点击事件处理函数
function createImageItem(image) {
    const div = document.createElement('div');
    div.className = 'image-item';
    
    const uniqueId = `${image.code}_${image.supplier}`;
    const productData = JSON.parse(localStorage.getItem('productData') || '{}');
    const product = productData[uniqueId] || {};
    
    div.innerHTML = `
        <div class="select-overlay ${selectedItems.has(uniqueId) ? 'selected' : ''}" 
             onclick="toggleSelectItem('${uniqueId}', event)">
            <div class="checkbox">${selectedItems.has(uniqueId) ? '✓' : ''}</div>
        </div>
        <button class="zoom-btn" onclick="event.stopPropagation(); showZoomedImage('${image.file}')">+</button>
        <img src="${image.file}" alt="${image.code}">
        <div class="info">
            <p><span>编码</span><span class="clickable" onclick="event.stopPropagation(); showPriceCompare('${image.code}')">${image.code}</span></p>
            <p><span>名称</span><span>${product.name || '-'}</span></p>
            <p class="sensitive-info"><span>供应商</span><span>${product.supplier || '-'}</span></p>
            <p class="sensitive-info"><span>成本</span><span>${product.cost || '-'}</span></p>
            <p><span>单价</span><span>${product.price || '-'}</span></p>
            <p class="size-info"><span>尺码</span><span>${product.size || '-'}</span></p>
        </div>
    `;
    
    // 添加整个商品项的点击事件
    div.addEventListener('click', () => {
        const fullProduct = {
            code: image.code,
            supplier: image.supplier,
            name: product.name || '',
            cost: product.cost || '',
            price: product.price || '',
            size: product.size || ''
        };
        openOrderForm(fullProduct);
    });
    
    return div;
}

// 同样修改批量上传函数
async function handleBatchImageUpload(event) {
    const files = event.target.files;
    if (!files.length) return;

    const progressBar = document.querySelector('.progress-bar');
    const progress = document.querySelector('.progress');
    progressBar.style.display = 'block';

    try {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!file.type.startsWith('image/')) continue;

            const code = file.name.split('.')[0];
            
            // 压缩图片
            const compressedImageUrl = await compressImage(file);
            
            const percent = ((i + 1) / files.length) * 100;
            progress.style.width = percent + '%';

            saveImageData(code, compressedImageUrl);
        }
        updateImageGrid();
    } catch (error) {
        console.error('批量上传失败:', error);
        alert('批量上传失败，请重试');
    } finally {
        progressBar.style.display = 'none';
        progress.style.width = '0%';
        event.target.value = '';
    }
}

// 修改打开编辑表单函数
function openEditForm(code) {
    const editForm = document.getElementById('editForm');
    const overlay = document.getElementById('overlay');
    const productData = JSON.parse(localStorage.getItem('productData') || '{}');

    // 如果已经被移动过，保持当前位置
    if (!editForm.hasAttribute('data-moved')) {
        editForm.style.transform = 'translate(-50%, -50%)';
    }

    // 显示表单,但不改变背景
    editForm.classList.add('active');
    overlay.classList.add('active');
    overlay.style.backgroundColor = 'transparent';

    // 查找商品信息
    const matchingProducts = Object.values(productData).filter(product => product.code === code);
    
    if (matchingProducts.length > 0) {
        // 使用商品信息,但清空客户和备注等订单相关信息
        const product = matchingProducts[0];
        fillFormWithProduct({
            code: product.code,
            name: product.name || '',
            supplier: product.supplier || '',
            cost: product.cost || '',
            price: product.price || '',
            size: product.size || '',
            remark: '',  // 清空备注
            quantity: 1  // 重置数量
        });
    } else {
        // 如果没有找到商品，使用空白表单
        fillFormWithProduct({
            code: code || '',
            name: '',
            supplier: '',
            cost: '',
            price: '',
            size: '',
            remark: '',
            quantity: 1
        });
    }

    // 清空客户输入框并聚焦
    document.getElementById('editCustomer').value = '';
    document.getElementById('editCustomer').focus();
}

// 添加填充表单的辅助函数
function fillFormWithProduct(product) {
    document.getElementById('editCode').value = product.code;
    document.getElementById('editName').value = product.name || '';
    document.getElementById('editSupplier').value = product.supplier || '';
    document.getElementById('editCost').value = product.cost || '';
    document.getElementById('editPrice').value = product.price || '';
    document.getElementById('editSize').value = product.size || '';
    document.getElementById('editRemark').value = product.remark || '';
    document.getElementById('editQuantity').value = 1;
    document.getElementById('editCustomer').value = '';
}

// 关闭编辑表单
function closeEditForm() {
    const editProductForm = document.getElementById('editProductForm');
    const overlay = document.getElementById('overlay');
    editProductForm.classList.remove('active');
    overlay.classList.remove('active');
}

// 修改保存新商品数据函数
function saveNewItemData() {
    const code = document.getElementById('newItemCode').value;
    const supplier = document.getElementById('newItemSupplier').value;
    const preview = document.getElementById('newItemPreview');
    
    if (!code || !supplier) {
        alert('商品编码和供应商不能为空');
        return;
    }
    
    if (preview.style.display === 'none') {
        alert('请选择商品图片');
        return;
    }
    
    const uniqueId = `${code}_${supplier}`;
    const productData = JSON.parse(localStorage.getItem('productData') || '{}');
    
    // 检查是否已存在相同的商品和供应商组合
    if (productData[uniqueId]) {
        if (!confirm('该商品和供应商组合已存在，是否覆盖？')) {
            return;
        }
    }
    
    // 保存新商品数据
    productData[uniqueId] = {
        id: uniqueId,
        code: code,
        name: document.getElementById('newItemName').value,
        supplier: supplier,
        cost: document.getElementById('newItemCost').value,
        price: document.getElementById('newItemPrice').value,
        size: document.getElementById('newItemSize').value,
        remark: document.getElementById('newItemRemark').value,
        timestamp: new Date().toISOString()
    };

    try {
        localStorage.setItem('productData', JSON.stringify(productData));
        
        // 保存图片数据
        saveImageToDB(code, preview.src, supplier).then(() => {
            // 更新显示
            updateImageGrid();
            closeNewItemForm();
            alert('新款添加成功！');
        }).catch(error => {
            console.error('保存图片数据失败:', error);
            alert('保存图片数据失败，请重试');
        });
    } catch (error) {
        console.error('保存商品数据失败:', error);
        alert('保存失败: ' + error.message);
    }
}

// 修改打开新商品表单函数
function openNewItemForm(supplier = '') {
    const newItemForm = document.getElementById('newItemForm');
    const overlay = document.getElementById('overlay');
    
    // 清空表单
    document.getElementById('newItemCode').value = '';
    document.getElementById('newItemName').value = '';
    document.getElementById('newItemSupplier').value = supplier;
    document.getElementById('newItemCost').value = '';
    document.getElementById('newItemPrice').value = '';
    document.getElementById('newItemSize').value = '';
    document.getElementById('newItemRemark').value = '';
    
    // 清空图片预览
    const preview = document.getElementById('newItemPreview');
    preview.src = '';
    preview.style.display = 'none';
    document.getElementById('newItemImage').value = '';
    
    // 显示表单
    newItemForm.classList.add('active');
    overlay.classList.add('active');
    
    // 聚焦到商品编码输入框
    document.getElementById('newItemCode').focus();
}

// 修改关闭新商品表单函数
function closeNewItemForm() {
    const newItemForm = document.getElementById('newItemForm');
    const overlay = document.getElementById('overlay');
    newItemForm.classList.remove('active');
    overlay.classList.remove('active');
}

// 修改初始化表单提交处理
function initializeForms() {
    const newProductForm = document.getElementById('newProductForm');
    if (newProductForm) {
        newProductForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveNewItemData();
        });
    }

    const productEditForm = document.getElementById('productEditForm');
    if (productEditForm) {
        productEditForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveEditProductData();
        });
    }
    
    // 初始化订表单
    initializeOrderForm();
}

// 添加Excel处理相关函数
function initializeExcelImport() {
    const excelFile = document.getElementById('excelFile');
    excelFile.addEventListener('change', handleExcelImport);
}

// 修改 handleExcelImport 函数添加进度显示
async function handleExcelImport(event) {
    console.log('开始处理Excel导入...');
    const file = event.target.files[0];
    if (!file) {
        console.log('没有选择文件');
        return;
    }
    console.log('选择的文件:', file.name);

    const progressBar = document.querySelector('.progress-bar');
    const progress = document.querySelector('.progress');
    progressBar.style.display = 'block';
    progress.style.width = '0%';

    try {
        // 显示读取Excel进度
        console.log('开始读取Excel文件...');
        progress.style.width = '20%';
        const data = await readExcelFile(file);
        console.log('Excel文件读取完成，数据条数:', data?.length);
        
        if (data && data.length > 0) {
            // 显示处理数据进度
            progress.style.width = '40%';
            console.log(`开始处理 ${data.length} 条数据...`);
            
            // 处理Excel数据并显示度
            await processExcelData(data, progress);
            
            progress.style.width = '90%';
            console.log('开始新界面...');
            await updateImageGrid();
            progress.style.width = '100%';
            
            console.log('Excel导出成功');
            alert('Excel导入成功！');
        } else {
            throw new Error('Excel文件为空或格式不正');
        }
    } catch (error) {
        console.error('Excel导入失败:', error);
        alert('Excel导入失败: ' + error.message);
    } finally {
        progressBar.style.display = 'none';
        progress.style.width = '0%';
        event.target.value = '';
    }
}

// 修改 processExcelData 函数，确保正确处理尺码信息
async function processExcelData(data, progress) {
    const productData = JSON.parse(localStorage.getItem('productData') || '{}');
    const startProgress = 40;
    const endProgress = 90;
    const progressStep = (endProgress - startProgress) / data.length;
    
    console.log('开始处理Excel数据...');
    
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const code = row['商品编码']?.toString() || '';
        if (!code) continue;

        console.log(`处理第 ${i + 1}/${data.length} 条数据，编码: ${code}`);

        // 使用编码和供应商合作为唯一标识
        const supplier = row['供应商'] || '';
        const uniqueId = `${code}_${supplier}`;

        // 更新商品数据，确保包含尺码信息
        productData[uniqueId] = {
            id: uniqueId,
            code: code,
            name: row['商品名称'] || '',
            supplier: supplier,
            cost: row['成本'] || '',
            price: row['单价'] || '',
            size: row['尺码'] || '',  // 确保保存尺码信息
            remark: row['备注'] || '',
            timestamp: new Date().toISOString()
        };

        // 创建一个默认的空白图片记录，包含供应商信息
        await saveImageToDB(code, createEmptyImage(), supplier);

        // 更新进度条
        const currentProgress = startProgress + (i + 1) * progressStep;
        progress.style.width = `${currentProgress}%`;
    }

    // 保存更新后的商品数据
    localStorage.setItem('productData', JSON.stringify(productData));
    console.log('Excel数据处理完成');
}

// 修改 readExcelFile 函数，添加尺码到必要字段
function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = e.target.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                // 检查必要字段，添加尺码
                const requiredFields = ['商品编码', '商品名称', '供应商', '成本', '单价', '尺码'];
                const firstRow = jsonData[0];
                const missingFields = requiredFields.filter(field => !(field in firstRow));

                if (missingFields.length > 0) {
                    reject(new Error(`Excel缺少必要字段: ${missingFields.join(', ')}`));
                    return;
                }

                resolve(jsonData);
            } catch (error) {
                reject(new Error('Excel文件解析失败: ' + error.message));
            }
        };
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsBinaryString(file);
    });
}

// 创建空图片
function createEmptyImage() {
    // 创建一个100x100的空白图片
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    
    // 填充白色背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 100, 100);
    
    // 添加文字提示
    ctx.fillStyle = '#999999';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('待上传', 50, 50);
    
    return canvas.toDataURL('image/jpeg', 0.8);
}

// 修改文件夹关联处理函数
async function handleFolderSelect(event) {
    console.log('开始处理文件夹...');
    const files = Array.from(event.target.files).filter(file => 
        file.type.startsWith('image/')
    );
    
    if (!files.length) {
        alert('未找到图片文件');
        return;
    }

    const progressBar = document.querySelector('.progress-bar');
    const progress = document.querySelector('.progress');
    progressBar.style.display = 'block';
    progress.style.width = '0%';

    try {
        // 获取现有的商品数据
        const productData = JSON.parse(localStorage.getItem('productData') || '{}');
        // 收集所有可能的商品编码
        const existingProducts = new Set(
            Object.values(productData).map(product => product.code)
        );
        
        console.log('现有商品编码:', existingProducts);
        
        let matchCount = 0;
        let noMatchCount = 0;
        const noMatchFiles = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            // 从文件名中提取编码（去掉扩展名）
            const code = file.name.split('.')[0];
            
            // 检查是否存在对应的商品记录
            if (existingProducts.has(code)) {
                console.log(`找到匹配商品: ${code}`);
                matchCount++;
                
                try {
                    // 压缩图片
                    const targetSize = file.size > 1024 * 1024 ? 200 : 100;
                    console.log(`压缩图片: ${code}`);
                    const compressedImageUrl = await compressImage(file, targetSize);
                    
                    // 查找该编码的所有供应商记录
                    const suppliers = Object.values(productData)
                        .filter(product => product.code === code)
                        .map(product => product.supplier);

                    // 个供应商保存图片
                    for (const supplier of suppliers) {
                        const uniqueId = `${code}_${supplier}`;
                        await saveImageToDB(code, compressedImageUrl, supplier);
                        console.log(`保存成功: ${uniqueId}`);
                    }
                } catch (err) {
                    console.error(`理图片失败 ${code}:`, err);
                }
            } else {
                console.log(`未找到匹配的商编码: ${code}`);
                noMatchCount++;
                noMatchFiles.push(file.name);
            }
            
            // 更新进度
            const percent = ((i + 1) / files.length) * 100;
            progress.style.width = `${percent}%`;
        }
        
        // 更新显
        await updateImageGrid();
        
        // 显示详细结果
        let message = `处理完成！\n成��匹配: ${matchCount} �����������\n��������配: ${noMatchCount} 个\n总文件数: ${files.length} 个`;
        if (noMatchCount > 0) {
            message += '\n\n未匹配的文件:\n' + noMatchFiles.join('\n');
        }
        alert(message);
        
    } catch (error) {
        console.error('理文件夹失败:', error);
        alert('处理文件失: ' + error.message);
    } finally {
        progressBar.style.display = 'none';
        progress.style.width = '0%';
        event.target.value = ''; // 清空input以允许重复选择
    }
}

// 修改初始化拖放功能的函数
function initializeDragAndDrop() {
    try {
        const dropZone = document.getElementById('dropZone');
        // 如果没有找到 dropZone 元素，直接返回成功
        if (!dropZone) {
            console.log('dropZone 元素不存在，跳过拖放初始化');
            return Promise.resolve('initializeDragAndDrop: 跳过 - dropZone不存在');
        }

        // 添加拖放事件监听器
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        // 添加拖放区域的视觉反馈
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, highlight, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, unhighlight, false);
        });

        function highlight(e) {
            dropZone.classList.add('drag-over');
        }

        function unhighlight(e) {
            dropZone.classList.remove('drag-over');
        }

        // 处理文件拖放
        dropZone.addEventListener('drop', handleDrop, false);

        function handleDrop(e) {
            const dt = e.dataTransfer;
            const files = dt.files;
            handleFiles(files);
        }

        return Promise.resolve('initializeDragAndDrop: 成功');
    } catch (error) {
        console.warn('初始化拖放功能时出错:', error);
        return Promise.resolve('initializeDragAndDrop: 跳过 - ' + error.message);
    }
}

// 修改打开记录管器函数
function openRecordManager() {
    // 打开新窗口
    window.open('records.html', '_blank', 'width=800,height=600');
}

function closeRecordManager() {
    const recordManager = document.getElementById('recordManager');
    const overlay = document.getElementById('overlay');
    
    if (recordManager && overlay) {
        recordManager.classList.remove('active');
        overlay.classList.remove('active');
    }
}

// 修改管理记录显示函数
function updateRecordManager() {
    const recordList = document.getElementById('recordListManager');
    const orderData = JSON.parse(localStorage.getItem('orderData') || '{}');
    const searchText = document.getElementById('recordSearch').value.toLowerCase();

    // 按时间倒序排序订单
    const orders = Object.values(orderData)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .filter(order => {
            const searchString = `${order.customer}${order.code}${order.name}`.toLowerCase();
            return searchString.includes(searchText);
        });

    recordList.innerHTML = orders.map(order => `
            <div class="record-item-manager">
                <div class="record-info">
                <div>客户：${order.customer || '未填写'}</div>
                <div>商品：${order.code} - ${order.name || ''}</div>
                <div>尺码：${order.size || '-'} | 数量：${order.quantity}件 | 单价：¥${order.price || '-'}</div>
                <div>供应商：${order.supplier || '-'}</div>
                <div>备注：${order.remark || '-'}</div>
                <div class="order-time">时间：${new Date(order.timestamp).toLocaleString()}</div>
                </div>
                <div class="record-actions">
                <button onclick="editRecord('${order.id}')" class="edit-btn">编辑</button>
                <button onclick="deleteRecord('${order.id}')" class="delete-btn">删除</button>
                </div>
            </div>
    `).join('');
}

// 添加删除记录功能
function deleteRecord(orderId) {
    if (!confirm('确定要删除这条记录吗？')) return;

    const orderData = JSON.parse(localStorage.getItem('orderData') || '{}');
    delete orderData[orderId];
    localStorage.setItem('orderData', JSON.stringify(orderData));
    
    // 更新显示
    updateRecordManager();
    updateRecentOrders();
}

// 添加编辑记录功能
function editRecord(orderId) {
    const orderData = JSON.parse(localStorage.getItem('orderData') || '{}');
    const order = orderData[orderId];
    if (!order) return;

    // 打开开单窗口并填充数据
    const orderForm = document.getElementById('orderForm');
    orderForm.style.display = 'block';

    // 填充表单数据
    document.getElementById('orderCode').value = order.code;
    document.getElementById('orderName').value = order.name;
    document.getElementById('orderSupplier').value = order.supplier;
    document.getElementById('orderCost').value = order.cost;
    document.getElementById('orderPrice').value = order.price;
    document.getElementById('orderCustomer').value = order.customer;
    document.getElementById('orderSize').value = order.size;
    document.getElementById('orderQuantity').value = order.quantity;
    document.getElementById('orderRemark').value = order.remark;

    // 添加编辑标记
    document.getElementById('createOrderForm').dataset.editId = orderId;
}

// 修改保存订单函数
function saveOrder(event) {
    // 防止表单默认提交行为和事件冒泡
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    try {
        // 获取表单数据
        const orderForm = document.getElementById('createOrderForm');
        
        // 获取并清理表单数据
        const formData = {
            customer: document.getElementById('orderCustomer').value.trim(),
            size: document.getElementById('orderSize').value.trim(),
            quantity: document.getElementById('orderQuantity').value.trim(),
            code: document.getElementById('orderCode').value.trim(),
            name: document.getElementById('orderName').value.trim(),
            supplier: document.getElementById('orderSupplier').value.trim(),
            cost: document.getElementById('orderCost').value.trim(),
            price: document.getElementById('orderPrice').value.trim(),
            remark: document.getElementById('orderRemark').value.trim()
        };

        // 验证必填字段
        if (!formData.customer || !formData.size || !formData.quantity) {
            if (!formData.customer) {
                alert('请填写客户名称！');
                document.getElementById('orderCustomer').focus();
            } else if (!formData.size) {
                alert('请填写尺码！');
                document.getElementById('orderSize').focus();
            } else if (!formData.quantity) {
                alert('请填写数量！');
                document.getElementById('orderQuantity').focus();
            }
            return false;
        }

        // 获取或生成订单ID
        const editId = orderForm.dataset.editId;
        const orderData = JSON.parse(localStorage.getItem('orderData') || '{}');
        const orderId = editId || Date.now().toString();

        // 创建订单对象
        const order = {
            id: orderId,
            ...formData,
            timestamp: editId ? orderData[orderId].timestamp : new Date().toISOString()
        };

        // 保存订单
        orderData[orderId] = order;
        localStorage.setItem('orderData', JSON.stringify(orderData));

        // 更新最近订单显示
        updateRecentOrders();

        // 保存成功后只清空部分字段，保留客户名称和商品信息
        document.getElementById('orderSize').value = '';
        document.getElementById('orderQuantity').value = '1';
        document.getElementById('orderRemark').value = '';
        
        // 清除编辑标记
        delete orderForm.dataset.editId;

        // 聚焦到尺码输入框，准备下一单
        document.getElementById('orderSize').focus();

        return true;

    } catch (error) {
        console.error('保存订单失败:', error);
        alert('保存订单失败: ' + error.message);
        return false;
    }
}

// 修改事件监听器绑定
document.addEventListener('DOMContentLoaded', function() {
    // 获取表单元素
    const form = document.getElementById('createOrderForm');
    if (!form) return;

    // 获取保存按钮
    const submitButton = form.querySelector('button[type="submit"]');
    if (!submitButton) return;

    // 移除表单的默认提交事件
    form.onsubmit = null;

    // 只给保存按钮添加点击事件
    submitButton.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();

        // 获取表单数据
        const formData = {
            customer: document.getElementById('orderCustomer').value.trim(),
            size: document.getElementById('orderSize').value.trim(),
            quantity: document.getElementById('orderQuantity').value.trim(),
            code: document.getElementById('orderCode').value.trim(),
            name: document.getElementById('orderName').value.trim(),
            supplier: document.getElementById('orderSupplier').value.trim(),
            cost: document.getElementById('orderCost').value.trim(),
            price: document.getElementById('orderPrice').value.trim(),
            remark: document.getElementById('orderRemark').value.trim()
        };

        // 验证必填字段
        if (!formData.customer || !formData.size || !formData.quantity) {
            if (!formData.customer) {
                alert('请填写客户名称！');
                document.getElementById('orderCustomer').focus();
            } else if (!formData.size) {
                alert('请填写尺码！');
                document.getElementById('orderSize').focus();
            } else if (!formData.quantity) {
                alert('请填写数量！');
                document.getElementById('orderQuantity').focus();
            }
            return;
        }

        try {
            // 获取或生成订单ID
            const editId = form.dataset.editId;
            const orderData = JSON.parse(localStorage.getItem('orderData') || '{}');
            const orderId = editId || Date.now().toString();

            // 创建订单对象
            const order = {
                id: orderId,
                ...formData,
                timestamp: editId ? orderData[orderId].timestamp : new Date().toISOString()
            };

            // 保存订单
            orderData[orderId] = order;
            localStorage.setItem('orderData', JSON.stringify(orderData));

            // 更新最近订单显示
            updateRecentOrders();

            // 保存成功后只清空部分字段，保留客户名称和商品信息
            const fieldsToReset = {
                'orderSize': '',
                'orderQuantity': '1',
                'orderRemark': ''
            };

            // 重置指定字段
            Object.entries(fieldsToReset).forEach(([id, value]) => {
                document.getElementById(id).value = value;
            });
            
            // 清除编辑标记
            delete form.dataset.editId;

            // 立即聚焦到尺码输入框
            setTimeout(() => {
                const sizeInput = document.getElementById('orderSize');
                sizeInput.focus();
                // 可选：选中整个文本
                sizeInput.select();
            }, 0);

        } catch (error) {
            console.error('保存订单失败:', error);
            alert('保存订单失败: ' + error.message);
        }
    };
});

// 添加搜索功能
function initializeRecordSearch() {
    const searchInput = document.getElementById('recordSearch');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            const searchText = e.target.value.toLowerCase();
            filterRecords(searchText);
        });
    }
}

function filterRecords(searchText) {
    const recordListManager = document.getElementById('recordListManager');
    const recordData = JSON.parse(localStorage.getItem('recordData') || '{}');
    
    const filteredRecords = Object.entries(recordData)
        .filter(([code, record]) => {
            const searchString = `${code} ${record.name} ${record.supplier} ${record.customer}`.toLowerCase();
            return searchString.includes(searchText);
        })
        .sort((a, b) => new Date(b[1].timestamp) - new Date(a[1].timestamp));  // 正确的写法

    recordListManager.innerHTML = filteredRecords.map(([code, record]) => `
        <div class="record-item-manager">
            <div class="record-info">
                <div>${code} - ${record.name || ''}</div>
                <div>供应商: ${record.supplier || '-'}</div>
                <div>客户: ${record.customer || '-'}</div>
                <div>成本: ${record.cost || '-'} | 单价: ${record.price || '-'}</div>
            </div>
            <div class="record-actions">
                <button onclick="editRecord('${code}')" class="edit-btn">编辑</button>
                <button onclick="deleteRecord('${code}')" class="delete-btn">删除</button>
            </div>
        </div>
    `).join('');
}

// 添加一个函数来更新商品网格的数
function updateGridColumns(columns) {
    const supplierImages = document.querySelectorAll('.supplier-images');
    supplierImages.forEach(grid => {
        grid.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
    });
    // 保存用户的选择
    localStorage.setItem('gridColumns', columns);
}

// 修改初始化列数控制函数
function initializeGridColumns() {
    // 获取保存的列数，默认为6
    const savedColumns = localStorage.getItem('gridColumns') || 6;
    
    // 创建列数控制器
    const controls = document.querySelector('.controls');
    const columnControl = document.createElement('div');
    columnControl.className = 'column-control';
    columnControl.innerHTML = `
        <label>每行显示：
            <input type="number" 
                   id="columnInput" 
                   value="${savedColumns}" 
                   min="1" 
                   max="12" 
                   style="width: 60px;">
            列
        </label>
    `;
    controls.appendChild(columnControl);

    // 添加事件监听器
    const columnInput = document.getElementById('columnInput');
    
    // 输入时更新
    columnInput.addEventListener('input', (e) => {
        let value = parseInt(e.target.value);
        // 限制输入范围
        if (value < 1) value = 1;
        if (value > 12) value = 12;
        updateGridColumns(value);
    });
    
    // 失去焦点时确保值在有效范围内
    columnInput.addEventListener('blur', (e) => {
        let value = parseInt(e.target.value);
        if (isNaN(value) || value < 1) value = 1;
        if (value > 12) value = 12;
        e.target.value = value;
        updateGridColumns(value);
    });

    // 初始化列数
    updateGridColumns(savedColumns);
}

// 在页面加载时初始化所有功能
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 检查浏览器支持
        if (!window.indexedDB) {
            throw new Error('您的浏览器不支持 IndexedDB，请使用现代浏览器');
        }

        console.log('开始初始化系统...');
        
        // 先初始化数据库
        console.log('正在初始化数据库...');
        await initDB();
        console.log('数据库初始化成功');

        // 初始化其他功能
        const initResults = [];

        // 使用 try-catch 分别处理每个初始化函数
        const initFunctions = [
            { name: 'initializeImageUpload', fn: initializeImageUpload },
            { name: 'initializeForms', fn: initializeForms },
            { name: 'initializeExcelImport', fn: initializeExcelImport },
            { name: 'initializeFolderInput', fn: initializeFolderInput },
            { name: 'initializeDragAndDrop', fn: initializeDragAndDrop },
            { name: 'initializeProductEditForm', fn: initializeProductEditForm },
            { name: 'initializeGridColumns', fn: initializeGridColumns }
        ];

        for (const { name, fn } of initFunctions) {
            try {
                await fn();
                console.log(`${name} 初始化成功`);
                initResults.push(`${name}: 成功`);
            } catch (error) {
                console.error(`${name} 初始化失败:`, error);
                initResults.push(`${name}: 失败 - ${error.message}`);
            }
        }

        // 更新显示
        try {
            await updateImageGrid();
            console.log('图片网格更新成功');
        } catch (error) {
            console.error('图片网格更新失败:', error);
        }

        // 添加价格显示切换功能
        const infoToggle = document.getElementById('infoToggle');
        if (infoToggle) {
            infoToggle.addEventListener('click', () => {
                document.body.classList.toggle('show-sensitive');
            });
        }

        // 设置导出日期默认为当天
        const exportDateInput = document.getElementById('exportDate');
        if (exportDateInput) {
            const today = new Date().toISOString().split('T')[0];
            exportDateInput.value = today;
        }

        // 初始化新商品图片上传
        try {
            initializeNewItemImageUpload();
            console.log('新商品图片上传初始化成功');
        } catch (error) {
            console.error('新商品图片上传初始化失败:', error);
        }

        console.log('系统初始化完成');
        console.log('初始化结果:', initResults);

    } catch (error) {
        console.error('系统初始化失败:', error);
        const errorDetails = `初始化失败: ${error.message}\n\n详细信息:\n${error.stack}`;
        console.error(errorDetails);
        alert('系统初始化失败，请查看控制台了解详细信息');
    }
});

// 添加数据库状态检查函数
function checkDBConnection() {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('数据库未连接'));
            return;
        }

        try {
            const transaction = db.transaction(['images'], 'readonly');
            const store = transaction.objectStore('images');
            const request = store.count();

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(new Error('数据库连接测试败'));
        } catch (error) {
            reject(error);
        }
    });
}

// 在每次操作前检查数据库连接
async function ensureDBConnection() {
    try {
        await checkDBConnection();
    } catch (error) {
        console.log('重新连接数据库...');
        await initDB();
    }
}

// 修清除数据功能
async function clearAllData() {
    const password = prompt('输入管理员密:');
    
    // 验证密码
    if (password !== '900910') {
        alert('密码错误！');
        return;
    }

    if (!confirm('确定要清除所有商品数据吗？此操作不可恢复！\n(订单数据将会保留)')) {
        return;
    }

    try {
        // 只清除商品相关数据
        localStorage.removeItem('productData');  // 清除商品数据
        
        // 清除 IndexedDB 中的图片数据
        await clearImagesFromDB();
        
        // 更新显示
        await updateImageGrid();
        
        alert('商品数据已清除！');
    } catch (error) {
        console.error('清除数据失败:', error);
        alert('清除数失败: ' + error.message);
    }
}

// 清除 IndexedDB 中的图片数据
async function clearImagesFromDB() {
    await ensureDBConnection();
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction(['images'], 'readwrite');
            const store = transaction.objectStore('images');
            const request = store.clear();
            
            request.onsuccess = () => {
                console.log('图片数据已清除');
                resolve();
            };
            
            request.onerror = () => {
                console.error('清除图片数据失败:', request.error);
                reject(request.error);
            };
        } catch (error) {
            console.error('清除图片数据事务失败:', error);
            reject(error);
        }
    });
}

// 修改价格比较功能为版本选择
function showPriceCompare(code) {
    const productData = JSON.parse(localStorage.getItem('productData') || '{}');
    const priceCompareModal = document.getElementById('priceCompareModal');
    const priceCompareList = document.getElementById('priceCompareList');
    
    // 找出所有相同编码的品
    const matchingProducts = Object.values(productData).filter(product => product.code === code);
    
    if (matchingProducts.length > 0) {
        // 生版本择表
        priceCompareList.innerHTML = `
            <div class="price-compare-header">
                <h4>商品编码: ${code}</h4>
                <p>商品称: ${matchingProducts[0].name || '-'}</p>
                <span class="close-btn" onclick="closePriceCompare()">&times;</span>
            </div>
            ${matchingProducts.map(product => {
                const supplier = (product.supplier || '').replace(/'/g, '&#39;');
                return `
                    <div class="price-compare-item">
                        <div class="supplier-info">
                            <div class="supplier-name">${supplier || '未知商'}</div>
                            <div class="extra-info">
                                <div>备注: ${product.remark || '-'}</div>
                            </div>
                        </div>
                        <div class="price-info">
                            <div class="price">¥${product.price || '-'}</div>
                            <div class="cost">成本: ¥${product.cost || '-'}</div>
                            <button class="select-btn" onclick="fillOrderForm('${product.code}', '${product.name}', '${product.supplier}', '${product.price}', '${product.cost}')">
                                选择此版本
                            </button>
                        </div>
                    </div>
                `;
            }).join('')}
        `;

        // 添加样式
        const style = document.createElement('style');
        style.textContent = `
            .price-compare-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 15px;
                border-bottom: 1px solid #eee;
            }
            .close-btn {
                font-size: 24px;
                cursor: pointer;
                color: #666;
                padding: 0 10px;
            }
            .close-btn:hover {
                color: #333;
            }
            .price-compare-item {
                padding: 15px;
                border: 1px solid #eee;
                border-radius: 8px;
                margin-bottom: 10px;
            }
            .supplier-info {
                margin-bottom: 8px;
            }
            .supplier-name {
                font-weight: bold;
                font-size: 15px;
                color: #333;
            }
            .extra-info {
                font-size: 13px;
                color: #666;
                margin-top: 4px;
            }
            .price-info {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .price {
                font-size: 16px;
                font-weight: bold;
                color: #f44336;
            }
            .cost {
                font-size: 13px;
                color: #666;
            }
            .select-btn {
                background: #2196F3;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                transition: background 0.3s;
            }
            .select-btn:hover {
                background: #1976D2;
            }
        `;
        document.head.appendChild(style);
        
        priceCompareModal.classList.add('active');
        document.getElementById('overlay').classList.add('active');
    } else {
        alert('未找到相关商品信息');
    }
}

// 添加关闭版本选择的函数
function closePriceCompare() {
    const modal = document.getElementById('priceCompareModal');
    const overlay = document.getElementById('overlay');
    if (modal) modal.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
}

// 修改供应商导航更新函数
function updateSupplierNav() {
    const supplierNav = document.getElementById('supplierNav');
    const productData = JSON.parse(localStorage.getItem('productData') || '{}');
    
    // 从 productData 中获取所有供应商并去重
    const suppliers = [...new Set(Object.values(productData)
        .map(product => product.supplier || '未分类')
        .filter(supplier => supplier))];
    
    suppliers.sort(); // 按字母顺序排序
    
    // 生成供应商导航列表
    supplierNav.innerHTML = `
        <div class="supplier-nav-header">供应商导航</div>
        ${suppliers.map(supplier => `
            <div class="supplier-nav-item" onclick="scrollToSupplier('${supplier}')">
                ${supplier}
            </div>
        `).join('')}
    `;
}

    // 添加滚动到指定供应商的函数
    function scrollToSupplier(supplier) {
        const supplierSection = document.querySelector(`.supplier-group[data-supplier="${supplier}"]`);
        if (supplierSection) {
            supplierSection.scrollIntoView({ behavior: 'smooth' });
        }
    }

    // 添加选择状态管理
    let selectedItems = new Set();

    // 添加选择/取消选功能
    function toggleSelectItem(id, event) {
        event.stopPropagation(); // 阻止事件冒泡
        
        // 获取当前点击的选择框元素
        const selectOverlay = event.currentTarget;
        const checkbox = selectOverlay.querySelector('.checkbox');
        
        if (selectedItems.has(id)) {
            selectedItems.delete(id);
            selectOverlay.classList.remove('selected');
            checkbox.textContent = '';
        } else {
            selectedItems.add(id);
            selectOverlay.classList.add('selected');
            checkbox.textContent = '✓';
        }
        
        // 只更新批量操作按钮
        updateBatchActions();
    }

    // 修改批量操作按钮的显示/隐藏函数
    function updateBatchActions() {
        const batchActions = document.getElementById('batchActions');
        if (selectedItems.size > 0) {
            batchActions.style.display = 'flex';
            batchActions.innerHTML = `
                <span class="count">已选择 ${selectedItems.size} 项</span>
                <button onclick="editSelectedItems()" class="edit-btn">编辑商品</button>
                <button onclick="deleteSelectedItems()" class="delete-btn">删除选中</button>
                <button onclick="clearSelection()" class="cancel-btn">取消选择</button>
            `;
        } else {
            batchActions.style.display = 'none';
        }
    }

    // 优化批量删除功能
    async function deleteSelectedItems() {
        if (selectedItems.size === 0) return;
        
        if (!confirm(`确定要删除中的 ${selectedItems.size} 个商吗？此操作不可恢复！`)) {
            return;
        }

        const progressBar = document.querySelector('.progress-bar');
        const progress = document.querySelector('.progress');
        progressBar.style.display = 'block';

        try {
            const productData = JSON.parse(localStorage.getItem('productData') || '{}');
            const total = selectedItems.size;
            let completed = 0;

            // 使用 Promise.all 并发处理删除操作
            await Promise.all(Array.from(selectedItems).map(async (id) => {
                try {
                    delete productData[id];
                    await deleteImageFromDB(id);
                    completed++;
                    progress.style.width = `${(completed / total) * 100}%`;
                } catch (error) {
                    console.error(`删除项 ${id} 失败:`, error);
                }
            }));

            localStorage.setItem('productData', JSON.stringify(productData));
            selectedItems.clear();
            await updateImageGrid();
            updateBatchActions();
            
            alert('删除成功！');
        } catch (error) {
            console.error('批量删除失败:', error);
            alert('删除失败，请重试');
        } finally {
            progressBar.style.display = 'none';
            progress.style.width = '0%';
        }
    }

    // 消所有选择
    function clearSelection() {
        // 清除所有选中状态
        selectedItems.clear();
        
        // 直接更新 DOM，而不是重新渲染整个网格
        document.querySelectorAll('.select-overlay').forEach(overlay => {
            overlay.classList.remove('selected');
            overlay.querySelector('.checkbox').textContent = '';
        });
        
        // 隐藏批量操作按钮
        const batchActions = document.getElementById('batchActions');
        batchActions.style.display = 'none';
    }

    // 修改批量编辑功能
    function editSelectedItems() {
        if (selectedItems.size === 0) {
            alert('请选择要编辑的商品');
            return;
        }

        const productData = JSON.parse(localStorage.getItem('productData') || '{}');
        const firstItemId = Array.from(selectedItems)[0];
        const firstProduct = productData[firstItemId];

        // 打开商品编辑表单
        const editProductForm = document.getElementById('editProductForm');
        const overlay = document.getElementById('overlay');

        // 填充表单数据
        document.getElementById('editProductCode').value = firstProduct.code;
        document.getElementById('editProductCode').readOnly = false; // 允许编辑商品编码
        document.getElementById('editProductName').value = firstProduct.name || '';
        document.getElementById('editProductSupplier').value = firstProduct.supplier || '';
        document.getElementById('editProductCost').value = firstProduct.cost || '';
        document.getElementById('editProductPrice').value = firstProduct.price || '';
        document.getElementById('editProductSize').value = firstProduct.size || '';
        document.getElementById('editProductRemark').value = firstProduct.remark || '';

        // 添加批量编辑标记
        editProductForm.dataset.batchEdit = 'true';

        editProductForm.classList.add('active');
        overlay.classList.add('active');
    }

    // 修改保存编辑数据的函数
    async function saveEditProductData(event) {
        event.preventDefault();
        
        const editProductForm = document.getElementById('editProductForm');
        const isBatchEdit = editProductForm.dataset.batchEdit === 'true';
        const productData = JSON.parse(localStorage.getItem('productData') || '{}');

        // 获取表单数据
        const formData = {
            code: document.getElementById('editProductCode').value.trim(),
            name: document.getElementById('editProductName').value.trim(),
            supplier: document.getElementById('editProductSupplier').value.trim(),
            cost: document.getElementById('editProductCost').value.trim(),
            price: document.getElementById('editProductPrice').value.trim(),
            size: document.getElementById('editProductSize').value.trim(),
            remark: document.getElementById('editProductRemark').value.trim()
        };

        try {
            if (isBatchEdit) {
                // 批量更新选中的商品
                for (const id of selectedItems) {
                    const oldProduct = productData[id];
                    const newId = `${formData.code}_${formData.supplier}`;
                    
                    // 删除旧记录
                    delete productData[id];
                    
                    // 创建新记录
                    productData[newId] = {
                        ...oldProduct,
                        ...formData,
                        id: newId,
                        timestamp: new Date().toISOString()
                    };

                    // 更新图片关联
                    await updateImageAssociation(oldProduct.code, formData.code, oldProduct.supplier, formData.supplier);
                }
                
                // 清除选择状态
                selectedItems.clear();
            } else {
                // 单个商品编辑逻辑...
                // 保持原有的单个编辑逻辑不变
            }

            // 保存更新后的数据
            localStorage.setItem('productData', JSON.stringify(productData));
            
            // 更新显示
            await updateImageGrid();
            
            // 关闭编辑表单
            closeEditProductForm();
            
            alert('保存成功！');
        } catch (error) {
            console.error('保存失败:', error);
            alert('保存失败: ' + error.message);
        }
    }

    // 添加更新图片关联的函数
    async function updateImageAssociation(oldCode, newCode, oldSupplier, newSupplier) {
        try {
            const oldImage = await getImageFromDB(oldCode, oldSupplier);
            if (oldImage) {
                // 保存图片到新的位置
                await saveImageToDB(newCode, oldImage.file, newSupplier);
                // 删除旧的图片记录
                await deleteImageFromDB(`${oldCode}_${oldSupplier}`);
            }
        } catch (error) {
            console.error('更新图片关联失败:', error);
            throw error;
        }
    }

    // 修改关闭编辑表单的函数
    function closeEditProductForm() {
        const editProductForm = document.getElementById('editProductForm');
        const overlay = document.getElementById('overlay');
        
        // 清除批量编辑标记
        delete editProductForm.dataset.batchEdit;
        
        editProductForm.classList.remove('active');
        overlay.classList.remove('active');
    }

    // 初始化商品编辑表单
    function initializeProductEditForm() {
        const form = document.getElementById('productEditForm');
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            await saveEditProductData(e);
        });
    }

    // 修改导出订单数据功能
    function exportData() {
        const orderData = JSON.parse(localStorage.getItem('orderData') || '{}');
        const exportDate = document.getElementById('exportDate').value || new Date().toISOString().split('T')[0];
        
        // 过滤选择日期的订单
        const dayStart = new Date(exportDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(exportDate);
        dayEnd.setHours(23, 59, 59, 999);

        const filteredOrders = Object.values(orderData).filter(order => {
            const orderDate = new Date(order.timestamp);
            orderDate.setHours(0, 0, 0, 0);
            return orderDate >= dayStart && orderDate < dayEnd;
        });

        if (filteredOrders.length === 0) {
            alert(`${exportDate} 没有订单记录`);
            return;
        }

        // 创建Excel工作表，按指定顺序排列字段
        const ws = XLSX.utils.json_to_sheet(filteredOrders.map(order => ({
                '客户': order.customer || '',
                '商品编码': order.code || '',
                '商品名称': order.name || '',
                '尺码': order.size || '',
            '单价': order.price || '',
            '成本': order.cost || '',
            '数量': order.quantity || '',
            '供货商': order.supplier || '',
            '录入时间': new Date(order.timestamp).toLocaleString(),
                '备注': order.remark || ''
        })));

        // 设置列宽
        ws['!cols'] = [
            { wch: 15 },  // 客户
            { wch: 15 },  // 商品编码
            { wch: 30 },  // 商品名称
            { wch: 10 },  // 尺码
            { wch: 10 },  // 单价
            { wch: 10 },  // 成本
            { wch: 10 },  // 数量
            { wch: 15 },  // 供货商
            { wch: 20 },  // 录入时间
            { wch: 30 }   // 备注
        ];

        // 创建工作簿并导出
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '订单记录');
        XLSX.writeFile(wb, `订单记录_${exportDate}.xlsx`);
    }

    // 修改导出统计功能
    function exportSupplierStats() {
        const orderData = JSON.parse(localStorage.getItem('orderData') || '{}');
        const exportDate = document.getElementById('exportDate').value || new Date().toISOString().split('T')[0];
        
        // 滤当天的订单
        const dayStart = new Date(exportDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(exportDate);
        dayEnd.setHours(23, 59, 59, 999);

        const filteredOrders = Object.values(orderData).filter(order => {
            const orderDate = new Date(order.timestamp);
            orderDate.setHours(0, 0, 0, 0);
            return orderDate >= dayStart && orderDate < dayEnd;
        });

        if (filteredOrders.length === 0) {
            alert(`${exportDate} 没有订单记录`);
            return;
        }
        
        // 创建工作簿
        const wb = XLSX.utils.book_new();
        
        // 按供应商分组统计
        const supplierStats = {};
        filteredOrders.forEach(order => {
            const supplier = order.supplier || '未知供应商';
            if (!supplierStats[supplier]) {
                supplierStats[supplier] = {
                    supplier: supplier,
                    totalCost: 0,
                    totalQuantity: 0,
                    totalAmount: 0,
                    orderCount: 0,
                    orders: []
                };
            }
            
            const quantity = Number(order.quantity) || 0;
            const price = Number(order.price) || 0;
            const cost = Number(order.cost) || 0;
            const amount = quantity * price;
            
            supplierStats[supplier].totalCost += quantity * cost;
            supplierStats[supplier].totalQuantity += quantity;
            supplierStats[supplier].totalAmount += amount;
            supplierStats[supplier].orderCount++;
            supplierStats[supplier].orders.push(order);
        });

        // 创建汇总表
        const summarySheet = XLSX.utils.json_to_sheet(Object.values(supplierStats)
            .sort((a, b) => {
                if (a.supplier === '未知供应商') return 1;
                if (b.supplier === '未知供应商') return -1;
                return a.supplier.localeCompare(b.supplier);
            })
            .map(stat => ({
                '供货商': stat.supplier,
                '总成本': Math.round(stat.totalCost),
                '总数量': stat.totalQuantity,
                '总金额': Math.round(stat.totalAmount),
                '订单数': stat.orderCount
            })));

        // 设置汇总表的列宽
        summarySheet['!cols'] = [
            { wch: 20 },  // 供应商
            { wch: 12 },  // 总成本
            { wch: 10 },  // 总数量
            { wch: 12 },  // 总金额
            { wch: 10 }   // 订单数
        ];

        // 添加汇总表
        XLSX.utils.book_append_sheet(wb, summarySheet, '供应商汇总');

        // 为每个供应商创建详细订单表
        Object.values(supplierStats).forEach(stat => {
            const detailSheet = XLSX.utils.json_to_sheet(stat.orders.map(order => ({
                '时间': new Date(order.timestamp).toLocaleString(),
                '商品编码': order.code,
                '商品名称': order.name,
                '客户': order.customer,
                '数量': order.quantity,
                '单价': order.price,
                '金额': (Number(order.quantity) * Number(order.price)).toFixed(2),
                '成本': order.cost,
                '备注': order.remark
            })));

            // 设置详细表的列宽
            detailSheet['!cols'] = [
                { wch: 20 },  // 时间
                { wch: 15 },  // 商品编码
                { wch: 30 },  // 商品名称
                { wch: 15 },  // 客户
                { wch: 10 },  // 数量
                { wch: 10 },  // 单价
                { wch: 12 },  // 金额
                { wch: 10 },  // 成本
                { wch: 20 }   // 备注
            ];

            XLSX.utils.book_append_sheet(wb, detailSheet, stat.supplier.substring(0, 31));
        });

        // 导出文件名添加日期
        const formattedDate = exportDate.replace(/-/g, '');
        XLSX.writeFile(wb, `供应商统计_${formattedDate}.xlsx`);
    }

    // 添加格式化供应商统计数据的辅助函数
    function formatSupplierStat(stat) {
        const grossProfit = stat.totalAmount - stat.totalCost;
        const profitRate = stat.totalAmount === 0 ? 0 : (grossProfit / stat.totalAmount * 100);
        
        return {
            '供应商': stat.supplier,
            '订单数': stat.orderCount,
            '总数量': stat.totalQuantity,
            '总金额': stat.totalAmount.toFixed(2),
            '总成本': stat.totalCost.toFixed(2),
            '毛利': grossProfit.toFixed(2),
            '毛利率': profitRate.toFixed(2) + '%'
        };
    }

    // 添加导出商品数据功能
    function exportProductData() {
        const productData = JSON.parse(localStorage.getItem('productData') || '{}');
        
        if (Object.keys(productData).length === 0) {
            alert('没有商品数据可导出');
            return;
        }

        try {
            // 将商品数据转换为数组格式
            const products = Object.values(productData).map(product => ({
                '商品编码': product.code,
                '商品名称': product.name || '',
                '供应商': product.supplier || '',
                '成本': product.cost || '',
                '单价': product.price || '',
                '尺码': product.size || '',
                '备注': product.remark || '',
                '最后更新时间': new Date(product.timestamp).toLocaleString()
            }));

            // 创建工作簿工作表
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(products);

            // 设置列宽
            const colWidths = [
                { wch: 15 },  // 商品编码
                { wch: 30 },  // 商品名称
                { wch: 15 },  // 供应商
                { wch: 10 },  // 成本
                { wch: 10 },  // 单价
                { wch: 10 },  // 尺码
                { wch: 30 },  // 备注
                { wch: 20 }   // 最后更新时间
            ];
            ws['!cols'] = colWidths;

            // 添加工作表到工作簿
            XLSX.utils.book_append_sheet(wb, ws, '商品数据');

            // 导出文件
            const now = new Date().toISOString().split('T')[0];
            XLSX.writeFile(wb, `商品数据_${now}.xlsx`);

            alert('商品数据导出成功！');
        } catch (error) {
            console.error('导出商品数据失败:', error);
            alert('导出失败: ' + error.message);
        }
    }

    // 加文件夹关联功能初始化
    function initializeFolderInput() {
        const folderInput = document.getElementById('folderInput');
        if (folderInput) {
            folderInput.addEventListener('change', handleFolderSelect);
        } else {
            console.error('找不到 folderInput 元素');
        }
    }

    // 添加一个不显示价格的客户列表
    const hidePriceCustomers = ['客户A', '客户B', '客户C']; // 可以根据需要添加客户名称

    // 修改生成标签HTML内容
    function generateLabelHTML(labelData) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>订单标签</title>
                <style>
                    @page {
                        size: A4;
                        margin: 5mm;
                    }
                    body {
                        margin: 0;
                        padding: 2mm;
                    }
                    .label-container {
                        display: grid;
                        grid-template-columns: repeat(5, 1fr); /* 5列 */
                        gap: 1mm;                             /* 减小间距 */
                        padding: 1mm;
                    }
                    .label {
                        border: 1px solid #000;
                        padding: 3px;                         /* 减小内边距 */
                        break-inside: avoid;
                        page-break-inside: avoid;
                        display: flex;
                        flex-direction: row;
                        margin-bottom: 1mm;                   /* 减小底部边距 */
                        font-size: 12px;
                        height: 55mm;                         /* 调整高度以适应10行 */
                    }
                    .label-image {
                        width: 50mm;                         /* 调整图片宽度 */
                        height: 50mm;                        /* 调整图片高度 */
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border: 1px solid #eee;
                        background: #f9f9f9;
                        flex-shrink: 0;
                    }
                    .label-image img {
                        max-width: 100%;
                        max-height: 100%;
                        object-fit: contain;
                    }
                    .label-info {
                        flex: 1;
                        font-size: 14px;
                        padding-left: 3px;
                        display: flex;
                        flex-direction: column;
                        justify-content: space-between;
                    }
                    .customer-name {
                        font-size: 16px;
                        font-weight: bold;
                        text-align: center;
                        margin: 0;
                        padding: 2px 0;
                    }
                    .details {
                        display: flex;
                        flex-direction: column;
                        gap: 2px;
                    }
                    .details-row {
                        display: flex;
                        justify-content: space-around;
                        align-items: center;
                        margin: 0;
                    }
                    @media print {
                        .label {
                            break-inside: avoid;
                            page-break-inside: avoid;
                        }
                        .no-print {
                            display: none;
                        }
                        /* 每50个标签后强制分页 */
                        .label:nth-child(50) {
                            page-break-after: always;
                        }
                    }
                    .print-button {
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        padding: 10px 20px;
                        background: #4CAF50;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        z-index: 1000;
                    }
                    .print-button:hover {
                        background: #45a049;
                    }
                </style>
            </head>
            <body>
                <button onclick="window.print()" class="print-button no-print">打印标签</button>
                <div class="label-container">
                    ${labelData.map(label => {
                        // 从localStorage获取最新的客户列表
                        const hidePriceCustomers = getHidePriceCustomers();
                        const shouldShowPrice = !hidePriceCustomers.includes(label.客户);
                        
                        return `
                        <div class="label">
                            <div class="label-image">
                                <img src="${label._IMAGE_}" 
                                     alt="商品图片"
                                     onerror="console.error('图片加载失败'); this.src='${createEmptyImage()}';">
                            </div>
                            <div class="label-info">
                                <div class="customer-name">${label.客户}</div>
                                <div class="details">
                                    <div class="details-row">
                                        <span>${label.尺码}</span>
                                        ${shouldShowPrice ? `<span>${label.单价}</span>` : ''}
                                    </div>
                                    ${label.备注 ? `<div class="details-row">${label.备注}</div>` : ''}
                                </div>
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
            </body>
            </html>
        `;
    }

    // 修改生成订单标签功能
    async function generateOrderLabels() {
        const orderData = JSON.parse(localStorage.getItem('orderData') || '{}');
        const exportDate = document.getElementById('exportDate').value || new Date().toISOString().split('T')[0];
        
        // 过滤选择日期的订单
        const dayStart = new Date(exportDate);
        dayStart.setHours(0, 0, 0, 0);  // 设置为当天开始时间
        const dayEnd = new Date(exportDate);
        dayEnd.setHours(23, 59, 59, 999);  // 设置为当天结束时间

        const filteredOrders = Object.values(orderData).filter(order => {
            const orderDate = new Date(order.timestamp);
            // 使用本地时间进行比较
            orderDate.setHours(0, 0, 0, 0);
            dayStart.setHours(0, 0, 0, 0);
            return orderDate >= dayStart && orderDate < dayEnd;
        });

        if (filteredOrders.length === 0) {
            alert(`${exportDate} 没有订单记录`);
            return;
        }

        try {
            console.log('开始生成标...');
            // 为每个订单根据数量创建多个标签数据
            const labelData = await Promise.all(filteredOrders.flatMap(async order => {
                try {
                    // 获取商品图片
                    console.log('获取图片:', order.code, order.supplier);
                    const imageData = await getImageFromDB(order.code, order.supplier);
                    console.log('获取到的图数据:', imageData);
                    
                    // 创建数量对应的标签数组
                    const quantity = parseInt(order.quantity) || 1;
                    return Array(quantity).fill().map(() => ({
                        '_IMAGE_': imageData?.file || createEmptyImage(),
                        '客户': order.customer || '',
                        '商品编码': order.code || '',
                        '尺码': order.size || '',
                        '单价': order.price || '',
                        '备注': order.remark || ''
                    }));
                } catch (error) {
                    console.error('处单个订单标签失败:', error);
                    return [{
                        '_IMAGE_': createEmptyImage(),
                        '客户': order.customer || '',
                        '商品编码': order.code || '',
                        '尺码': order.size || '',
                        '单价': order.price || '',
                        '备注': order.remark || ''
                    }];
                }
            }));

            // 展平标签数组
            const flattenedLabelData = labelData.flat();
            console.log('生成标签数据完成，总数:', flattenedLabelData.length);

            // 生成HTML版本的标签（用于打印）
            const htmlContent = generateLabelHTML(flattenedLabelData);
            const printWindow = window.open('', '_blank');
            printWindow.document.write(htmlContent);
            printWindow.document.close();
        } catch (error) {
            console.error('生成标签失败:', error);
            alert('生成标签失败: ' + error.message);
        }
    }

    // 添加一个获取和保存不显示价格客户列表的函数
    function getHidePriceCustomers() {
        return JSON.parse(localStorage.getItem('hidePriceCustomers') || '[]');
    }

    function saveHidePriceCustomers(customers) {
        localStorage.setItem('hidePriceCustomers', JSON.stringify(customers));
    }

    // 添加管理界面的数
    function openHidePriceManager() {
        const customers = getHidePriceCustomers();
        const html = `
            <div class="edit-form active" id="hidePriceManager">
                <div class="form-header">
                    <h3>管理不显示价格的客户</h3>
                    <button class="close-btn" onclick="closeHidePriceManager()">×</button>
                </div>
                <div style="padding: 20px;">
                    <div style="margin-bottom: 10px;">
                        <input type="text" id="newCustomer" placeholder="输入客户名称">
                        <button onclick="addHidePriceCustomer()" class="add-new-btn">添加</button>
                    </div>
                    <div id="customerList">
                        ${customers.map(customer => `
                            <div class="customer-item">
                                <span>${customer}</span>
                                <button onclick="removeHidePriceCustomer('${customer}')" class="delete-btn">删除</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        // 移除可能存在的旧实例
        const oldManager = document.getElementById('hidePriceManager');
        if (oldManager) {
            oldManager.remove();
        }

        // 添加到页面
        document.body.insertAdjacentHTML('beforeend', html);
        const overlay = document.getElementById('overlay');
        overlay.style.display = 'block';
        overlay.classList.add('active');
    }

    // 关闭管理界面
    function closeHidePriceManager() {
        const manager = document.getElementById('hidePriceManager');
        if (manager) {
            manager.remove();
        }
        const overlay = document.getElementById('overlay');
        overlay.style.display = 'none';
        overlay.classList.remove('active');
    }

    // 添加客户到不显示价格列表
    function addHidePriceCustomer() {
        const input = document.getElementById('newCustomer');
        const customer = input.value.trim();
        if (customer) {
            const customers = getHidePriceCustomers();
            if (!customers.includes(customer)) {
                customers.push(customer);
                saveHidePriceCustomers(customers);
                openHidePriceManager(); // 刷新显示
            }
            input.value = '';
        }
    }

    // 不显示格列表中移除客户
    function removeHidePriceCustomer(customer) {
        const customers = getHidePriceCustomers();
        const index = customers.indexOf(customer);
        if (index > -1) {
            customers.splice(index, 1);
            saveHidePriceCustomers(customers);
            openHidePriceManager(); // 刷新显示
        }
    }

    // 修改编辑尺码的函数
    function editSize(uniqueId, currentSize) {
        const newSize = prompt('请输入新尺码:', currentSize);
        if (newSize !== null) {  // 用户点击了确定
            const productData = JSON.parse(localStorage.getItem('productData') || '{}'); // 删除多余右括号
            if (productData[uniqueId]) {
                productData[uniqueId].size = newSize;
                productData[uniqueId].timestamp = new Date().toISOString();
                localStorage.setItem('productData', JSON.stringify(productData));
                
                // 更新显示
                updateRecordManager();
                updateImageGrid();
            }
        }
    }

    // 修改供应商报货表函数
    async function exportSupplierOrder() {
        try {
            const exportDate = document.getElementById('exportDate').value;
        const orderData = JSON.parse(localStorage.getItem('orderData') || '{}');
            
            // 获取保存的文字大小
            const savedTextSize = localStorage.getItem('reportTextSize') || '16';

            // 过滤指定日期的订单
        const filteredOrders = Object.values(orderData).filter(order => {
                const orderDate = new Date(order.timestamp).toISOString().split('T')[0];
                return orderDate === exportDate;
        });

        if (filteredOrders.length === 0) {
            alert(`${exportDate} 没有订单记录`);
            return;
        }

            // 生成报货表HTML
            const html = await generateSupplierOrderHTML(filteredOrders, exportDate, savedTextSize);
            
            // 创建新窗口显示报货表
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
            const reportWindow = window.open(url, '_blank');
            
            // 清理URL
        setTimeout(() => URL.revokeObjectURL(url), 100);
        } catch (error) {
            console.error('导出报货表失败:', error);
            alert('导出报货表失败: ' + error.message);
        }
    }

    // 修改生成报货表HTML的函数
    async function generateSupplierOrderHTML(filteredOrders, exportDate, savedTextSize) {
        let html = '';
        let totalAllQuantity = 0;
        const supplierOrders = {};

        // 按供应商分组订单
        for (const order of filteredOrders) {
            if (!order.supplier) continue;
            
            if (!supplierOrders[order.supplier]) {
                supplierOrders[order.supplier] = new Map();
            }
            
            const productKey = order.code;
            if (!supplierOrders[order.supplier].has(productKey)) {
                supplierOrders[order.supplier].set(productKey, {
                    code: order.code,
                    name: order.name,
                    sizes: new Map(),
                    total: 0,
                    image: null
                });
            }
            
            const product = supplierOrders[order.supplier].get(productKey);
            const size = order.size || '无尺码';
            const quantity = parseInt(order.quantity) || 0;
            
            if (!product.sizes.has(size)) {
                product.sizes.set(size, 0);
            }
            product.sizes.set(size, product.sizes.get(size) + quantity);
            product.total += quantity;
            totalAllQuantity += quantity;

                // 获取商品图片
            if (!product.image) {
                try {
                    const imageData = await getImageFromDB(order.code, order.supplier);
                    product.image = imageData?.file || null;
                } catch (error) {
                    console.error('获取图片失败:', error);
                }
            }
        }

        // 修改商品列表的生成部分
        for (const [supplier, products] of Object.entries(supplierOrders)) {
            let supplierTotal = 0;
            products.forEach(product => supplierTotal += product.total);

            html += `
                <div class="supplier-section">
                    <div class="supplier-title">
                        ${supplier} (总数量: ${supplierTotal})
                    </div>
                    <div class="product-list">
            `;

            // 遍历供应商的所有商品
            for (const [_, product] of products) {
                const sizes = Array.from(product.sizes.entries())
                    .sort((a, b) => {
                        const sizeA = parseInt(a[0]) || 0;
                        const sizeB = parseInt(b[0]) || 0;
                        return sizeA - sizeB;
                    });

                // 只修改这一行，将":"改为"*"，保持"、"不变
                const sizeList = sizes.map(([size, qty]) => `${size}*${qty}`).join('、');

                html += `
                    <div class="product-row">
                            <img src="${product.image || 'placeholder.png'}" 
                             class="product-image" 
                             alt="${product.code}"
                             onerror="this.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='">
                        <div class="product-info">
                            <div class="product-code">${product.code}</div>
                            <div class="product-name">${product.name || '-'}</div>
                            <div class="size-list">${sizeList}</div>
                            <div class="product-total">总数：${product.total}</div>
                        </div>
                    </div>
                `;
            }

            html += `
                    </div>
                </div>
            `;
        }

        // 修改样式部分
        const fullHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>供应商报货表 - ${exportDate}</title>
            <style>
                    :root {
                        --text-size: ${savedTextSize}px;
                    }
                    body { 
                        font-family: Arial; 
                        padding: 20px;
                    margin: 0;
                    }
                    .control-panel {
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        background: white;
                        padding: 15px;
                        border-radius: 8px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        z-index: 1000;
                }
                .product-row {
                    display: flex;
                        height: var(--image-size, 100px);
                        border: 1px solid #ddd;
                        margin-bottom: 8px;
                        background: white;
                        cursor: pointer;  /* 添加指针样式 */
                }
                .product-image {
                        width: 200px;
                    height: 100%;
                    object-fit: contain;
                        display: block;
                        flex: 0 0 200px;
                }
                .product-info {
                        display: flex;
                    align-items: center;
                        gap: 30px;
                        flex: 1;
                        padding: 0 15px;
                        margin-left: 20px;  /* 添加左边距 */
                }
                .product-code {
                        font-size: var(--text-size, 16px);
                    color: #1976D2;
                        font-weight: bold;
                        width: 250px;  /* 将宽度从 150px 改为 250px */
                }
                .product-name {
                        font-size: var(--text-size, 14px);
                        color: #000000;
                        font-weight: 700;
                        width: 250px;
                    }
                    .size-list {
                        font-size: var(--text-size, 16px);
                        flex: 1;
                        min-width: 200px;
                        color: #000000;
                        font-weight: 700;
                }
                .product-total {
                        font-size: var(--text-size, 16px);
                    color: #f44336;
                    font-weight: bold;
                        width: 120px;
                    text-align: right;
                    }
                    .supplier-section {
                        margin-bottom: 30px;
                        cursor: pointer;  /* 移动到供应商部分 */
                    }
                    .product-row {
                    display: flex;
                        height: var(--image-size, 100px);
                        border: 1px solid #ddd;
                        margin-bottom: 8px;
                        background: white;
                    }
                    .supplier-title {
                        font-size: calc(var(--text-size, 16px) * 1.5);  /* 标题字体比正文大50% */
                        padding: 15px;
                    background: #f5f5f5;
                        margin-bottom: 20px;
                        border-left: 5px solid #4CAF50;
                    }
                    .product-list {
                        display: flex;
                        flex-direction: column;
                    }
                    .control-panel input {
                        width: 60px;
                        padding: 4px;
                        margin-left: 8px;
                    }
                    .control-panel label {
                        display: block;
                        margin-bottom: 10px;
                }
            </style>
            <script src="https://html2canvas.hertzen.com/dist/html2canvas.min.js"></script>
            <script>
                    window.addEventListener('DOMContentLoaded', function() {
                        const textSizeInput = document.getElementById('textSizeInput');
                        if (textSizeInput) {
                            textSizeInput.value = '${savedTextSize}';
                            textSizeInput.addEventListener('input', function() {
                                const newSize = this.value;
                                document.documentElement.style.setProperty('--text-size', newSize + 'px');
                                localStorage.setItem('reportTextSize', newSize);
                            });
                        }

                        // 双击保存功能
                        document.querySelectorAll('.supplier-section').forEach(section => {
                            section.addEventListener('dblclick', async function() {
                                try {
                                    const canvas = await html2canvas(this, {
                            scale: 2,
                            useCORS: true,
                            logging: false,
                            backgroundColor: '#ffffff'
                        });

                        canvas.toBlob(async blob => {
                            try {
                                const item = new ClipboardItem({ "image/png": blob });
                                await navigator.clipboard.write([item]);
                                            alert('已复制到剪贴板！');
                            } catch (error) {
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            const supplierName = this.querySelector('.supplier-title').textContent.trim();
                                            a.download = supplierName + '.png';
                                            document.body.appendChild(a);
                                            a.click();
                                            document.body.removeChild(a);
                                            URL.revokeObjectURL(url);
                            }
                        });
                    } catch (error) {
                                    console.error('生成图片失败:', error);
                                    alert('生成图片失败: ' + error.message);
                    }
                            });
                        });
                    });
            </script>
            </head>
            <body>
                <div class="control-panel">
                    <label>
                        文字大小：
                        <input type="number" id="textSizeInput" 
                               min="12" max="36" value="${savedTextSize}">px
                    </label>
                </div>
                <h1>供应商报货表 - ${exportDate}</h1>
                <div class="total-info">
                    <p>供应商数量：${Object.keys(supplierOrders).length}</p>
                    <p>总数量：${totalAllQuantity}</p>
                </div>
                ${html}
            </body>
            </html>
        `;

        return fullHtml;
    }

    // 修改图片预览功能
    function initializeNewItemImageUpload() {
        const imageInput = document.getElementById('newItemImage');
        const preview = document.getElementById('newItemPreview');
        const codeInput = document.getElementById('newItemCode');
        const supplierInput = document.getElementById('newItemSupplier');
        
        imageInput.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            if (!file.type.startsWith('image/')) {
                alert('请选择图片文件');
                return;
            }
            
            try {
                // 从文件名中提取商品编码（去掉扩展名）
                const code = file.name.split('.')[0];
                codeInput.value = code;
                
                // 压缩图片
                const compressedImageUrl = await compressImage(file);
                preview.src = compressedImageUrl;
                preview.style.display = 'block';
                
                // 如果已存在该商品编码，自动填充其他信息，但保留当前供应商
                const productData = JSON.parse(localStorage.getItem('productData') || '{}');
                const matchingProducts = Object.values(productData).filter(p => p.code === code);
                
                if (matchingProducts.length > 0) {
                    const product = matchingProducts[0];
                    document.getElementById('newItemName').value = product.name || '';
                    document.getElementById('newItemCost').value = product.cost || '';
                    document.getElementById('newItemPrice').value = product.price || '';
                    document.getElementById('newItemSize').value = product.size || '';
                    document.getElementById('newItemRemark').value = product.remark || '';
                    
                    // 只在供应商字段为空时才填充供应商信息
                    if (!supplierInput.value) {
                        supplierInput.value = product.supplier || '';
                    }
                }
            } catch (error) {
                console.error('图片处理失败:', error);
                alert('图片处理失败，请重试');
            }
        });
    }

    // 修改开单相关函数
    function openOrderForm(product) {
        const orderForm = document.getElementById('orderForm');
        const overlay = document.getElementById('overlay');
        
        if (!orderForm) {
            console.error('找不到开单表单元素');
            return;
        }
        
        // 保存当前客户名称
        const currentCustomer = document.getElementById('orderCustomer').value;
        
        // 填充表单数据
        document.getElementById('orderCode').value = product.code || '';
        document.getElementById('orderName').value = product.name || '';
        document.getElementById('orderSupplier').value = product.supplier || '';
        document.getElementById('orderCost').value = product.cost || '';
        document.getElementById('orderPrice').value = product.price || '';
        
        // 重置其他字段，但保留客户名称
        document.getElementById('orderCustomer').value = currentCustomer; // 保持客户名称不变
        document.getElementById('orderSize').value = '';
        document.getElementById('orderQuantity').value = '1';
        document.getElementById('orderRemark').value = '';

        // 显示表单和遮罩
        orderForm.style.display = 'block';
        overlay.classList.add('active');

        // 如果没有客户名称，聚焦到客户输入框；否则聚焦到尺码输入框
        if (!currentCustomer) {
            document.getElementById('orderCustomer').focus();
        } else {
            document.getElementById('orderSize').focus();
        }
    }

    // 修改关闭开单表单函数
    function closeOrderForm() {
        const orderForm = document.getElementById('orderForm');
        const overlay = document.getElementById('overlay');
        
        if (orderForm) {
        orderForm.style.display = 'none';
    }
        overlay.classList.remove('active');
    }

    // 添加初始化开单表单的函数
    function initializeOrderForm() {
        // 绑定表单提交事件
        const form = document.getElementById('createOrderForm');
        if (form) {
            form.addEventListener('submit', function(e) {
                e.preventDefault();
                saveOrder();
            });
        }

        // 确保关闭按钮正常工作
        const closeBtn = document.querySelector('#orderForm .close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeOrderForm);
        }
    }

    // 在页面加载时初始化
    document.addEventListener('DOMContentLoaded', function() {
            initializeOrderForm();
        // ... 其他初始化代码 ...
    });

    // 修改最近订单显示函数
    function updateRecentOrders() {
        const orderData = JSON.parse(localStorage.getItem('orderData') || '{}');
        const recentOrdersList = document.getElementById('recentOrdersList');
        
        // 获最近的10个订单
        const recentOrders = Object.values(orderData)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 10);

        recentOrdersList.innerHTML = recentOrders.map(order => `
            <div class="recent-order-item ${order.isNewImport ? 'new-import' : ''}">
                <div class="order-main-info">
                    <span class="order-customer" contenteditable="true" 
                          onblur="updateOrderField('${order.id}', 'customer', this.textContent)">${order.customer || '未填写'}</span>
                    <div class="order-code-name">
                        <span class="order-code">${order.code}</span>
                        <span class="order-name">${order.name || ''}</span>
                    </div>
                </div>
                <div class="order-second-line">
                    <span class="order-size" contenteditable="true" 
                          onblur="updateOrderField('${order.id}', 'size', this.textContent)">${order.size || '-'}</span>
                    <div class="order-quantity-price">
                        <span>${order.quantity}件</span>
                        <span class="order-price" contenteditable="true" 
                              onblur="updateOrderField('${order.id}', 'price', this.textContent)">¥${order.price || '-'}</span>
                    </div>
                    <span class="order-time">${new Date(order.timestamp).toLocaleTimeString()}</span>
                </div>
            </div>
        `).join('');
    }

    // 添加点击事件监听器
    document.addEventListener('DOMContentLoaded', function() {
        const recentOrdersHeader = document.querySelector('.recent-orders-header h4');
        if (recentOrdersHeader) {
            recentOrdersHeader.addEventListener('click', openAllOrders);
        }
    });

    // 添加更新订单字段的函数
    function updateOrderField(orderId, field, value) {
        try {
            const orderData = JSON.parse(localStorage.getItem('orderData') || '{}');
            if (orderData[orderId]) {
                // 根据字段类型进行适当的处理
                if (field === 'quantity') {
                    // 移除数量前 '×' 符号并确保是数
                    value = value.replace(/[×x]/i, '').trim();
                    // 确保数量是正整数
                    const num = parseInt(value);
                    if (isNaN(num) || num < 1) {
                        alert('请输入有效的数量');
                        location.reload(); // 新加载以恢复原值
                        return;
                    }
                    orderData[orderId][field] = num;
                } else if (field === 'price') {
                    // 移除价格中的 '¥' 符号
                    value = value.replace('¥', '').trim();
                    orderData[orderId][field] = value;
                } else {
                    // 其他字段直接保存
                    orderData[orderId][field] = value.trim();
                }
                
                localStorage.setItem('orderData', JSON.stringify(orderData));
                
                // 更新当前页面的最近订单显示
                updateRecentOrders();
                
                // 如果是在全部订单页面中
                if (window.opener && !window.opener.closed) {
                    // 通知父窗口更新
                    window.opener.updateRecentOrders();
                } else {
                    // 如果是在主窗口中
                    // 通知所有打开的全部订单页面更新
                    const allWindows = window.opener ? [window.opener] : window.openedWindows || [];
                    allWindows.forEach(win => {
                        if (!win.closed) {
                            try {
                                // 尝试刷新全部订单页面
                                win.location.reload();
                            } catch (e) {
                                console.error('无法更新子窗口:', e);
                            }
                        }
                    });
                }
            }
        } catch (error) {
            console.error('更新订单失败:', error);
            alert('更新订单失败: ' + error.message);
        }
    }

    // 修改打开所有订单记录的函数
    function openAllOrders() {
        const orderData = JSON.parse(localStorage.getItem('orderData') || '{}');
        const exportDate = document.getElementById('exportDate').value || new Date().toISOString().split('T')[0];
        
        const dayStart = new Date(exportDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(exportDate);
        dayEnd.setHours(23, 59, 59, 999);
        
        const orders = Object.values(orderData)
            .filter(order => {
                const orderDate = new Date(order.timestamp);
                const dayStart = new Date(exportDate);
                const dayEnd = new Date(exportDate);
                dayEnd.setDate(dayEnd.getDate() + 1);
                return orderDate >= dayStart && orderDate < dayEnd;
            })
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // 移除多余的括号

        if (orders.length === 0) {
            alert(`${exportDate} 没有订单记录`);
            return;
        }

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>${exportDate} 订单记录</title>
                <style>
                    body { 
                        font-family: Arial; 
                        padding: 20px;
                        max-width: 1200px;
                        margin: 0 auto;
                    }
                    .order-list {
                        margin-top: 20px;
                    }
                    .order-item {
                        display: flex;
                        align-items: center;
                        padding: 15px;
                        border-bottom: 1px solid #eee;
                        gap: 20px;
                    }
                    .order-item:hover {
                        background: #f8f9fa;
                    }
                    .customer {
                        min-width: 120px;
                        font-weight: bold;
                    }
                    .product-info {
                        flex: 1;
                        display: flex;
                        gap: 15px;
                        align-items: center;
                    }
                    .code {
                        color: #1976D2;
                        font-family: monospace;
                        min-width: 100px;
                    }
                    .name {
                        color: #666;
                        flex: 1;
                    }
                    .size {
                        background: #f5f5f5;
                        padding: 4px 8px;
                        border-radius: 3px;
                        min-width: 60px;
                        text-align: center;
                    }
                    .quantity {
                        min-width: 60px;
                        text-align: center;
                    }
                    .price {
                        color: #f44336;
                        font-weight: bold;
                        min-width: 80px;
                        text-align: right;
                    }
                    .time {
                        color: #999;
                        min-width: 100px;
                        text-align: right;
                    }
                    .search-bar {
                        margin: 20px 0;
                        padding: 10px;
                        background: #f8f9fa;
                        border-radius: 4px;
                    }
                    .search-input {
                        width: 100%;
                        padding: 8px;
                        border: 1px solid #ddd;
                        border-radius: 4px;
                        font-size: 14px;
                    }
                    .delete-btn {
                        padding: 4px 8px;
                        background: #ff4444;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                    }
                    .delete-btn:hover {
                        background: #cc0000;
                    }
                    /* 添加可编辑元素的样式 */
                    .editable {
                        cursor: text;
                        padding: 2px 4px;
                        border-radius: 3px;
                        min-width: 30px;
                    }
                    .editable:hover {
                        background: #f0f0f0;
                    }
                    .editable:focus {
                        background: #fff;
                        outline: 2px solid #2196F3;
                        outline-offset: -2px;
                    }

                    /* 加选择样式 */
                    .select-checkbox {
                        width: 18px;
                        height: 18px;
                        margin-right: 10px;
                        cursor: pointer;
                    }

                    .batch-actions {
                        position: fixed;
                        bottom: 20px;
                        left: 50%;
                        transform: translateX(-50%);
                        background: white;
                        padding: 10px 20px;
                        border-radius: 8px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                        display: none;
                        align-items: center;
                        gap: 10px;
                        z-index: 1000;
                    }

                    .batch-actions.active {
                        display: flex;
                    }

                    .batch-delete-btn {
                        background: #ff4444;
                        color: white;
                        border: none;
                        padding: 8px 16px;
                        border-radius: 4px;
                        cursor: pointer;
                    }

                    .batch-cancel-btn {
                        background: #999;
                        color: white;
                        border: none;
                        padding: 8px 16px;
                        border-radius: 4px;
                        cursor: pointer;
                    }

                    .select-all-checkbox {
                        margin-right: 10px;
                    }
                </style>
                <script>
                    function searchOrders() {
                        const searchText = document.getElementById('searchInput').value.toLowerCase();
                        const orders = document.querySelectorAll('.order-item');
                        
                        orders.forEach(order => {
                            const text = order.textContent.toLowerCase();
                            order.style.display = text.includes(searchText) ? '' : 'none';
                        });
                    }

                    function deleteOrder(orderId) {
                        if (confirm('确定要删除这条订单记录吗？')) {
                            const orderData = JSON.parse(localStorage.getItem('orderData') || '{}');
                            delete orderData[orderId];
                            localStorage.setItem('orderData', JSON.stringify(orderData));
                            
                            // 通知父窗口更新
                            if (window.opener && !window.opener.closed) {
                                window.opener.updateRecentOrders();
                            }
                            
                            // 刷新当前页面
                            location.reload();
                        }
                    }

                    // 添加更新订单字段的函数
                    function updateOrderField(orderId, field, value) {
                        const orderData = JSON.parse(localStorage.getItem('orderData') || '{}');
                        if (orderData[orderId]) {
                            if (field === 'price') {
                                value = value.replace('¥', '').trim();
                            }
                            orderData[orderId][field] = value.trim();
                            localStorage.setItem('orderData', JSON.stringify(orderData));
                            
                            // 通知父窗口更新
                            if (window.opener && !window.opener.closed) {
                                window.opener.updateRecentOrders();
                            }
                        }
                    }

                    // 添加选择相关的函数
                    let selectedOrders = new Set();

                    function toggleSelect(orderId, checkbox) {
                        if (checkbox.checked) {
                            selectedOrders.add(orderId);
                        } else {
                            selectedOrders.delete(orderId);
                        }
                        updateBatchActions();
                    }

                    function toggleSelectAll(checkbox) {
                        const allCheckboxes = document.querySelectorAll('.select-checkbox');
                        allCheckboxes.forEach(cb => {
                            cb.checked = checkbox.checked;
                            const orderId = cb.getAttribute('data-id');
                            if (checkbox.checked) {
                                selectedOrders.add(orderId);
                            } else {
                                selectedOrders.delete(orderId);
                            }
                        });
                        updateBatchActions();
                    }

                    function updateBatchActions() {
                        const batchActions = document.querySelector('.batch-actions');
                        if (selectedOrders.size > 0) {
                            batchActions.classList.add('active');
                            batchActions.querySelector('.count').textContent = 
                                \`已选择 \${selectedOrders.size} 项\`;
                        } else {
                            batchActions.classList.remove('active');
                        }
                    }

                    function clearSelection() {
                        selectedOrders.clear();
                        const allCheckboxes = document.querySelectorAll('.select-checkbox');
                        allCheckboxes.forEach(cb => cb.checked = false);
                        document.querySelector('.select-all-checkbox').checked = false;
                        updateBatchActions();
                    }

                    function batchDeleteOrders() {
                        if (!confirm(\`确定要删除选中的 \${selectedOrders.size} 条订单吗？\`)) {
                            return;
                        }

                        const orderData = JSON.parse(localStorage.getItem('orderData') || '{}');
                        selectedOrders.forEach(orderId => {
                            delete orderData[orderId];
                        });
                        localStorage.setItem('orderData', JSON.stringify(orderData));

                        if (window.opener && !window.opener.closed) {
                            window.opener.updateRecentOrders();
                        }
                        location.reload();
                    }
                </script>
            </head>
            <body>
                <h2>${exportDate} 订单记录</h2>
                <div class="search-bar">
                    <input type="checkbox" class="select-all-checkbox" 
                           onclick="toggleSelectAll(this)">
                    <input type="text" 
                           id="searchInput" 
                           class="search-input" 
                           placeholder="搜索客户、商品编码、商品名称..." 
                           oninput="searchOrders()">
                </div>
                <div class="order-list">
                    ${orders.map(order => `
                        <div class="order-item">
                            <input type="checkbox" 
                                   class="select-checkbox" 
                                   data-id="${order.id}"
                                   onclick="toggleSelect('${order.id}', this)">
                            <span class="customer editable" 
                                  contenteditable="true" 
                                  onblur="updateOrderField('${order.id}', 'customer', this.textContent)">${order.customer || '未填写'}</span>
                            <div class="product-info">
                                <span class="code">${order.code}</span>
                                <span class="name">${order.name || '-'}</span>
                                <span class="size editable" 
                                      contenteditable="true" 
                                      onblur="updateOrderField('${order.id}', 'size', this.textContent)">${order.size || '-'}</span>
                                <span class="quantity editable"
                                      contenteditable="true"
                                      onblur="updateOrderField('${order.id}', 'quantity', this.textContent)">×${order.quantity}</span>
                            </div>
                            <span class="price editable" 
                                  contenteditable="true" 
                                  onblur="updateOrderField('${order.id}', 'price', this.textContent)">¥${order.price || '-'}</span>
                            <span class="time">${new Date(order.timestamp).toLocaleTimeString()}</span>
                            <button class="delete-btn" onclick="deleteOrder('${order.id}')">删除</button>
                        </div>
                    `).join('')}
                </div>
                <div class="batch-actions">
                    <span class="count"></span>
                    <button onclick="batchDeleteOrders()" class="batch-delete-btn">批量删除</button>
                    <button onclick="clearSelection()" class="batch-cancel-btn">取消选择</button>
                </div>
            </body>
            </html>
        `;

        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }

    // 设置导出日期为当前日期
    function setTodayDate() {
        const today = new Date().toISOString().split('T')[0];
        const exportDateInput = document.getElementById('exportDate');
        
        // 只有当日期为空或者是旧日期时才更新
        if (!exportDateInput.value || exportDateInput.value === '2024-12-17') {
            exportDateInput.value = today;
        }
        
        // 保存日期到 localStorage
        localStorage.setItem('lastExportDate', exportDateInput.value);
    }

    // 页面加载时设置日期
    function initializeDate() {
        const exportDateInput = document.getElementById('exportDate');
        const today = new Date().toISOString().split('T')[0];
        exportDateInput.value = today;
    }

    // 确保在 DOM 加载完成后执行
    document.addEventListener('DOMContentLoaded', initializeDate);
    
    // 立即执行一次
    setTodayDate();

    // 添加以图搜图功能
    function initializeImageSearch() {
        const html = `
            <div id="imageSearchModal" class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>以图搜图</h3>
                        <span class="close-btn" onclick="closeImageSearch()">&times;</span>
                    </div>
                    <div class="image-search-container">
                        <div class="image-upload-area" id="imageUploadArea">
                            <input type="file" id="imageSearchInput" accept="image/*" hidden>
                            <div class="upload-placeholder">
                                <i class="fas fa-camera"></i>
                                <p>点击上传图片或拖拽图片到此处</p>
                            </div>
                            <img id="imageSearchPreview" style="display: none;">
                        </div>
                        <div class="search-results" id="imageSearchResults">
                            <div class="results-header">
                                <h4>搜索结果</h4>
                                <span class="result-count"></span>
                            </div>
                            <div class="results-grid"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);

        // 添加样式
        const style = document.createElement('style');
        style.textContent = `
            .modal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                z-index: 1000;
            }
            .modal-content {
                background: white;
                margin: 5% auto;
                width: 90%;
                max-width: 1200px;
                border-radius: 8px;
                overflow: hidden;
            }
            .modal-header {
                padding: 15px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid #eee;
            }
            .close-btn {
                font-size: 24px;
                cursor: pointer;
            }
            .image-search-container {
                display: flex;
                gap: 20px;
                padding: 20px;
            }
            .image-upload-area {
                width: 300px;
                height: 300px;
                border: 2px dashed #ddd;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                position: relative;
            }
            .upload-placeholder {
                text-align: center;
            }
            .upload-placeholder i {
                font-size: 48px;
                color: #999;
            }
            #imageSearchPreview {
                position: absolute;
                width: 100%;
                height: 100%;
                object-fit: contain;
            }
            .search-results {
                flex: 1;
                min-height: 300px;
            }
            .results-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                gap: 15px;
                margin-top: 15px;
            }
            .result-item {
                border: 1px solid #eee;
                border-radius: 4px;
                padding: 10px;
                cursor: pointer;
            }
            .result-item img {
                width: 100%;
                height: 150px;
                object-fit: contain;
            }
            .result-item .info {
                margin-top: 8px;
                font-size: 12px;
            }
        `;
        document.head.appendChild(style);

        // 初始化事件监听
        initializeImageSearchEvents();
    }

    function initializeImageSearchEvents() {
        const uploadArea = document.getElementById('imageUploadArea');
        const searchInput = document.getElementById('imageSearchInput');
        const preview = document.getElementById('imageSearchPreview');

        uploadArea.addEventListener('click', () => searchInput.click());

        // 处理文件选择
        searchInput.addEventListener('change', handleImageSelect);

        // 处理拖放
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#2196F3';
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.style.borderColor = '#ddd';
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#ddd';
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                handleImageSelect({ target: { files: [file] } });
            }
        });
    }

    async function handleImageSelect(event) {
        const file = event.target.files[0];
        if (!file || !file.type.startsWith('image/')) return;

        const preview = document.getElementById('imageSearchPreview');
        const placeholder = document.querySelector('.upload-placeholder');

        // 显示预览
        const reader = new FileReader();
        reader.onload = async (e) => {
            preview.src = e.target.result;
            preview.style.display = 'block';
            placeholder.style.display = 'none';

            // 始搜索相似图片
            await searchSimilarImages(e.target.result);
        };
        reader.readAsDataURL(file);
    }

    async function searchSimilarImages(imageData) {
        const resultsGrid = document.querySelector('.results-grid');
        const resultCount = document.querySelector('.result-count');
        resultsGrid.innerHTML = '<div class="loading">正在搜索相似商品...</div>';

        try {
            // 获取所有商品数据
            const productData = JSON.parse(localStorage.getItem('productData') || '{}');
            const products = Object.values(productData);

            // 获取所有商品的图片并计算相似度
            const results = await Promise.all(products.map(async (product) => {
                try {
                    const productImage = await getImageFromDB(product.code, product.supplier);
                    if (productImage?.file) {
                        // 这可以添加图片相似度比较算法
                        // 目前简单返回所有图片
                        return {
                            ...product,
                            image: productImage.file,
                            similarity: Math.random() // 模拟相似度
                        };
                    }
                } catch (error) {
                    console.error('获取商品图片失败:', error);
                }
                return null;
            }));

            // 过滤掉没有图片的商品并按相似度排
            const validResults = results.filter(Boolean)
                .sort((a, b) => b.similarity - a.similarity);

            // 显示结果
            resultCount.textContent = `找到 ${validResults.length} 个相似商品`;
            resultsGrid.innerHTML = validResults.map(product => `
                <div class="result-item" onclick="openOrderForm(${JSON.stringify(product)})">
                    <img src="${product.image}" alt="${product.name}">
                    <div class="info">
                        <div>${product.name || ''}</div>
                        <div>${product.code}</div>
                    </div>
                </div>
            `).join('');

        } catch (error) {
            console.error('搜索相似图片失败:', error);
            resultsGrid.innerHTML = '<div class="error">搜索失败，请重试</div>';
        }
    }

    function openImageSearch() {
        const modal = document.getElementById('imageSearchModal');
        modal.style.display = 'block';
    }

    function closeImageSearch() {
        const modal = document.getElementById('imageSearchModal');
        modal.style.display = 'none';
        // 重置上传区域
        document.getElementById('imageSearchPreview').style.display = 'none';
        document.querySelector('.upload-placeholder').style.display = 'block';
        document.querySelector('.results-grid').innerHTML = '';
    }

    // 在页面加载时初始化
    document.addEventListener('DOMContentLoaded', () => {
        initializeImageSearch();
        // ... 其他初始化代码 ...
    });

    // 添加选择并填充订单的函数
    function selectAndFillOrder(product) {
        // 填充订单表单
        const orderForm = document.getElementById('orderForm');
        if (orderForm) {
            // 填充基本信息
            document.getElementById('orderCode').value = product.code || '';
            document.getElementById('orderName').value = product.name || '';
            document.getElementById('orderSupplier').value = product.supplier || '';
            document.getElementById('orderPrice').value = product.price || '';
            document.getElementById('orderCost').value = product.cost || '';
            
            // 设置默认数量为1
            document.getElementById('orderQuantity').value = '1';
            
            // 清空尺码和备注
            document.getElementById('orderSize').value = '';
            document.getElementById('orderRemark').value = '';
            
            // 显示表单
            orderForm.style.display = 'block';
            document.getElementById('overlay').classList.add('active');
            
            // 聚焦到尺码输入框
            document.getElementById('orderSize').focus();
        }
    }

    // 新增一个更简单的填充表单函数
    function fillOrderForm(code, name, supplier, price, cost) {
        document.getElementById('orderCode').value = code;
        document.getElementById('orderName').value = name;
        document.getElementById('orderSupplier').value = supplier;
        document.getElementById('orderPrice').value = price;
        document.getElementById('orderCost').value = cost;
        document.getElementById('orderQuantity').value = '1';
        document.getElementById('orderSize').value = '';
        document.getElementById('orderRemark').value = '';
        
        // 显示表单
        document.getElementById('orderForm').style.display = 'block';
        document.getElementById('overlay').classList.add('active');
        
        // 聚焦到尺码输入框
        document.getElementById('orderSize').focus();
        
        // 关闭版本选择窗口
        closePriceCompare();
    }

    // 添加导入订单功能
    document.getElementById('orderExcelFile').addEventListener('change', handleOrderImport);

    async function handleOrderImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            // 检查文件类型
            if (!file.name.match(/\.(xlsx|xls)$/i)) {
                throw new Error('请选择 Excel 文件 (.xlsx 或 .xls)');
            }

            const data = await readExcelFile(file);
            if (!Array.isArray(data) || data.length === 0) {
                throw new Error('Excel 文件中没有找到有效数据');
            }

            const orderData = JSON.parse(localStorage.getItem('orderData') || '{}');
            const importTime = new Date().toISOString();
            let importCount = 0;

            // 处理Excel数据
            for (const row of data) {
                // 检查必要字段
                if (!row['商品编码'] && !row['客户']) {
                    console.warn('跳过无效行:', row);
                    continue;
                }

                const orderId = 'order_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

                // 处理数量
                let quantity = (row['数量'] || '').toString();
                quantity = quantity.replace(/[件个\s]/g, '');
                if (!quantity || isNaN(parseInt(quantity))) {
                    quantity = '1';
                }

                // 处理价格
                let price = (row['单价'] || row['价格'] || '').toString();
                price = price.replace(/[¥\s]/g, '');
                if (!price || isNaN(parseFloat(price))) {
                    price = '0';
                }

                // 处理成本
                let cost = (row['成本'] || '').toString();
                cost = cost.replace(/[¥\s]/g, '');
                if (!cost || isNaN(parseFloat(cost))) {
                    cost = '0';
                }

                const order = {
                    id: orderId,
                    customer: row['客户'] || '',
                    code: row['商品编码'] || '',
                    name: row['商品名称'] || '',
                    size: row['尺码'] || '',
                    price: price,
                    cost: cost,
                    quantity: quantity,
                    supplier: row['供货商'] || '',
                    remark: row['备注'] || '',
                    timestamp: importTime,
                    isNewImport: true
                };

                orderData[orderId] = order;
                importCount++;
            }

            if (importCount === 0) {
                throw new Error('没有找到可导入的有效订单数据');
            }

            // 保存更新后的数据
            localStorage.setItem('orderData', JSON.stringify(orderData));
            
            // 更新显示
            updateRecentOrders();
            
            // 显示导入结果
            alert(`成功导入 ${importCount} 条订单数据`);
            
            // 清除文件选择
            event.target.value = '';

        } catch (error) {
            console.error('导入订单失败:', error);
            alert('导入订单失败: ' + error.message);
            // 清除文件选择
            event.target.value = '';
        }
    }

    // 读取Excel文件
    function readExcelFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = function(e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    // 确保工作簿存在
                    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
                        throw new Error('无效的 Excel 文件格式');
                    }
                    
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    if (!firstSheet) {
                        throw new Error('Excel 文件中没有找到工作表');
                    }
                    
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                    resolve(jsonData);
                } catch (error) {
                    console.error('Excel 解析错误:', error);
                    reject(new Error('Excel 文件解析失败: ' + (error.message || '未知错误')));
                }
            };
            
            reader.onerror = () => reject(new Error('文件读取失败'));
            
            try {
            reader.readAsArrayBuffer(file);
            } catch (error) {
                reject(new Error('文件读取失败: ' + error.message));
            }
        });
    }

    // 修改最近订单显示函数，添加新导入标记
    function updateRecentOrders() {
        const orderData = JSON.parse(localStorage.getItem('orderData') || '{}');
        const recentOrdersList = document.getElementById('recentOrdersList');
        
        const recentOrders = Object.values(orderData)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 10);

        recentOrdersList.innerHTML = recentOrders.map(order => `
            <div class="recent-order-item ${order.isNewImport ? 'new-import' : ''}">
                <div class="order-main-info">
                    <span class="order-customer" contenteditable="true" 
                          onblur="updateOrderField('${order.id}', 'customer', this.textContent)">${order.customer || '未填写'}</span>
                    <div class="order-code-name">
                        <span class="order-code">${order.code}</span>
                        <span class="order-name">${order.name || ''}</span>
                    </div>
                </div>
                <div class="order-second-line">
                    <span class="order-size" contenteditable="true" 
                          onblur="updateOrderField('${order.id}', 'size', this.textContent)">${order.size || '-'}</span>
                    <div class="order-quantity-price">
                        <span>${order.quantity}件</span>
                        <span class="order-price" contenteditable="true" 
                              onblur="updateOrderField('${order.id}', 'price', this.textContent)">¥${order.price || '-'}</span>
                    </div>
                    <span class="order-time">${new Date(order.timestamp).toLocaleTimeString()}</span>
                </div>
            </div>
        `).join('');
    }

    // 添加显放大片的函数
    function showZoomedImage(imageUrl) {
        const container = document.getElementById('zoomedImageContainer');
        const zoomedImage = document.getElementById('zoomedImage');
        
        zoomedImage.src = imageUrl;
        container.style.display = 'flex';
        document.body.style.overflow = 'hidden'; // 防止背景滚动
    }

    // 添加关闭放大图片的函数
    function closeZoomedImage() {
        const container = document.getElementById('zoomedImageContainer');
        container.style.display = 'none';
        document.body.style.overflow = ''; // 恢复背景滚动
    }

    // 添加点击背景关闭放大图片的功能
    document.getElementById('zoomedImageContainer').addEventListener('click', function(event) {
        if (event.target === this) {
            closeZoomedImage();
        }
    });

    // 添加 ESC 键关闭功能
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closeZoomedImage();
        }
    });
 