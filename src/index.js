const crypto = require(`crypto`)
const select = require(`unist-util-select`)
const sharp = require(`./safe-sharp`)
const axios = require(`axios`)
const cheerio = require(`cheerio`)
const { buildResponsiveSizes } = require(`./utils`)
const token = `ya29.Glv8Bsf56u7KyxisXm9ApUpFrIL8bcHcc1hpWWEa0llrlKCIMFfSCdEoSit59X746Qxn3378_QZxS2IovPEHDAttC74CubfQtK2xwgQpSOOgF9HIfr401OVVwwTz`;

module.exports = async (
  { files, markdownNode, markdownAST, pathPrefix, getNode, reporter, cache },
  pluginOptions
) => {
  const defaults = {
    maxWidth: 650,
    wrapperStyle: ``,
    backgroundColor: `white`,
    linkImagesToOriginal: true,
    showCaptions: false,
    pathPrefix,
    withWebp: false,
  }
  let fileName = `bebop_hero`

  // This will only work for markdown syntax image tags
  const markdownImageNodes = select(markdownAST, `image`)

  const rawHtmlNodes = select(markdownAST, `html`)

  const generateImagesAndUpdateNode = async function(node, resolve) {
    const cacheKey = `remark-images-images-blogcms-${fileName}-${optionsHash}`
    const options = _.defaults(pluginOptions, defaults)

    const metaReader = sharp()

    const optionsHash = crypto
        .createHash(`md5`)
        .update(JSON.stringify(options))
        .digest(`hex`)

    const response = await axios.get(
      `https://www.googleapis.com/storage/v1/b/staging.blogkielanlemonsapi.appspot.com/o/bebop_hero.jpg`,
      { headers: {"Authorization" : `Bearer ${token}`} }
    );

    console.log('gatsby-remark-images-blogcms: ', response)
  //  response.data.pipe(metaReader)

  //  const metadata = await metaReader.metadata()

  //  response.data.destroy()

    //build responsive imagesizes

    // Create our base image tag
    let imageTag = `
      <img
        class="gatsby-resp-image-image"
        style="width: 100%; height: 100%; margin: 0; vertical-align: middle; position: absolute; top: 0; left: 0; box-shadow: inset 0px 0px 0px 400px ${
          options.backgroundColor
        };"
        alt="${node.alt ? node.alt : defaultAlt}"
        title="${node.title ? node.title : ``}"
        src="${fallbackSrc}"
        srcset="${srcSet}"
        sizes="${responsiveSizesResult.sizes}"
      />
   `.trim()

    // if options.withWebp is enabled, generate a webp version and change the image tag to a picture tag
    if (options.withWebp) {
      imageTag = `
        <picture>
          <source
            srcset="${responsiveSizesResult.webpSrcSet}"
            sizes="${responsiveSizesResult.sizes}"
            type="image/webp"
          />
          <source
            srcset="${srcSet}"
            sizes="${responsiveSizesResult.sizes}"
          />
          <img
            class="gatsby-resp-image-image"
            style="width: 100%; height: 100%; margin: 0; vertical-align: middle; position: absolute; top: 0; left: 0; box-shadow: inset 0px 0px 0px 400px ${
              options.backgroundColor
            };"
            alt="${node.alt ? node.alt : defaultAlt}"
            title="${node.title ? node.title : ``}"
            src="${fallbackSrc}"
          />
        </picture>
      `.trim()
    }

    // Construct new image node w/ aspect ratio placeholder
    let rawHTML = `
      <span
        class="gatsby-resp-image-wrapper"
        style="position: relative; display: block; ${
          options.wrapperStyle
        }; max-width: ${presentationWidth}px; margin-left: auto; margin-right: auto;"
      >
        <span
          class="gatsby-resp-image-background-image"
          style="padding-bottom: ${ratio}; position: relative; bottom: 0; left: 0; background-image: url('${
      responsiveSizesResult.base64
    }'); background-size: cover; display: block;"
        >
          ${imageTag}
        </span>
      </span>
    `.trim()

    // Make linking to original image optional.
    if (options.linkImagesToOriginal) {
      rawHTML = `
        <a
          class="gatsby-resp-image-link"
          href="${originalImg}"
          style="display: block"
          target="_blank"
          rel="noopener"
        >
          ${rawHTML}
        </a>
      `.trim()
    }

    // Wrap in figure and use title as caption

    if (options.showCaptions && node.title) {
      rawHTML = `
      <figure class="gatsby-resp-image-figure">
      ${rawHTML}
      <figcaption class="gatsby-resp-image-figcaption">${node.title}</figcaption>
      </figure>`
    }
    await cache.set(cacheKey, rawHTML)
    return rawHTML
  }
  return Promise.all(
    // Simple because there is no nesting in markdown
    markdownImageNodes.map(
      node =>
        new Promise(async (resolve, reject) => {
        //  if (node.url.indexOf(`images.ctfassets.net`) !== -1) {
            console.log('generateImagesAndUpdateNode...')
            const rawHTML = await generateImagesAndUpdateNode(node, resolve)

            if (rawHTML) {
              // Replace the image node with an inline HTML node.
              node.type = `html`
              node.value = rawHTML
            }
            return resolve(node)
          //} else {
            // Image isn't relative so there's nothing for us to do.
        //    return resolve()
        //  }
        })
    )
  ).then(markdownImageNodes =>
    // HTML image node stuff
    Promise.all(
      // Complex because HTML nodes can contain multiple images
      rawHtmlNodes.map(
        node =>
          new Promise(async (resolve, reject) => {
            if (!node.value) {
              return resolve()
            }

            const $ = cheerio.load(node.value)
            if ($(`img`).length === 0) {
              // No img tags
              return resolve()
            }
            let imageRefs = []
            $(`img`).each(function() {
              imageRefs.push($(this))
            })

            for (let thisImg of imageRefs) {
              // Get the details we need.
              let formattedImgTag = {}
              formattedImgTag.url = thisImg.attr(`src`)
              formattedImgTag.title = thisImg.attr(`title`)
              formattedImgTag.alt = thisImg.attr(`alt`)

              if (!formattedImgTag.url) {
                return resolve()
              }

              if (formattedImgTag.url.indexOf(`images.ctfassets.net`) !== -1) {
                const rawHTML = await generateImagesAndUpdateNode(
                  formattedImgTag,
                  resolve
                )

                if (rawHTML) {
                  // Replace the image string
                  thisImg.replaceWith(rawHTML)
                } else {
                  return resolve()
                }
              }
            }
            // Replace the image node with an inline HTML node.
            node.type = `html`
            node.value = $(`body`).html() // fix for cheerio v1

            return resolve(node)
          })
        )
      ).then(htmlImageNodes =>
        markdownImageNodes.concat(htmlImageNodes).filter(node => !!node)
      )
    )
}
